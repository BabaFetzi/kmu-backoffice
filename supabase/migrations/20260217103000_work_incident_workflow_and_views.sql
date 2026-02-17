-- Work incidents workflow (MIG-2): events, RPCs, guards, KPI view

begin;

create table if not exists public.work_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.work_incidents(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  event_type text not null,
  note text,
  meta jsonb not null default '{}'::jsonb,
  constraint chk_work_incident_events_type
    check (event_type in ('created', 'reported', 'note', 'status_change', 'document_added', 'closed', 'reopened')),
  constraint chk_work_incident_events_note_length
    check (note is null or length(note) <= 4000)
);

create index if not exists idx_work_incident_events_incident_created_at
  on public.work_incident_events (incident_id, created_at desc);

create index if not exists idx_work_incident_events_created_by
  on public.work_incident_events (created_by);

alter table public.work_incident_events enable row level security;

drop policy if exists work_incident_events_select_roles on public.work_incident_events;
create policy work_incident_events_select_roles on public.work_incident_events
for select using (
  public.has_any_role(array['admin', 'buchhaltung', 'read_only']::public.app_role[])
);

drop policy if exists work_incident_events_insert_roles on public.work_incident_events;
create policy work_incident_events_insert_roles on public.work_incident_events
for insert with check (
  public.has_any_role(array['admin', 'buchhaltung']::public.app_role[])
  and created_by = auth.uid()
);

create or replace function public.log_work_incident_event(
  p_incident_id uuid,
  p_event_type text,
  p_note text default null,
  p_meta jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.work_incidents%rowtype;
  v_event_id uuid;
  v_note text;
begin
  if p_incident_id is null then
    raise exception 'incident_id fehlt.';
  end if;

  select *
    into v_incident
  from public.work_incidents
  where id = p_incident_id;

  if not found then
    raise exception 'Unfallfall nicht gefunden: %', p_incident_id;
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.work_incident_events (
    incident_id,
    created_by,
    event_type,
    note,
    meta
  ) values (
    p_incident_id,
    coalesce(auth.uid(), v_incident.created_by),
    p_event_type,
    v_note,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.log_work_incident_event(uuid, text, text, jsonb) from public;
grant execute on function public.log_work_incident_event(uuid, text, text, jsonb) to service_role;

create or replace function public.guard_work_incident_update() returns trigger
language plpgsql
as $$
begin
  if old.status = 'closed' and current_setting('app.allow_work_incident_closed_update', true) <> '1' then
    raise exception 'Geschlossener Unfallfall ist fixiert.';
  end if;

  if old.status is distinct from new.status
     and current_setting('app.allow_work_incident_status_update', true) <> '1' then
    raise exception 'Unfall-Status darf nur via Workflow-RPC geaendert werden.';
  end if;

  if new.status = 'reported' and new.reported_to_insurer_at is null then
    new.reported_to_insurer_at := now();
  end if;

  if new.status = 'closed' and nullif(trim(coalesce(new.close_reason, '')), '') is null then
    raise exception 'close_reason ist Pflicht bei status=closed.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_work_incident_update on public.work_incidents;
create trigger trg_guard_work_incident_update
before update on public.work_incidents
for each row
execute function public.guard_work_incident_update();

create or replace function public.audit_work_incident_insert() returns trigger
language plpgsql
as $$
begin
  perform public.log_work_incident_event(
    new.id,
    'created',
    null,
    jsonb_build_object(
      'status', new.status,
      'incident_no', new.incident_no,
      'incident_type', new.incident_type,
      'severity', new.severity
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_work_incident_created_event on public.work_incidents;
create trigger trg_work_incident_created_event
after insert on public.work_incidents
for each row
execute function public.audit_work_incident_insert();

create or replace function public.audit_work_incident_status_change() returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    perform public.log_work_incident_event(
      new.id,
      case
        when new.status = 'reported' then 'reported'
        when new.status = 'closed' then 'closed'
        else 'status_change'
      end,
      null,
      jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_work_incident_status_event on public.work_incidents;
create trigger trg_work_incident_status_event
after update of status on public.work_incidents
for each row
execute function public.audit_work_incident_status_change();

create or replace function public.report_work_incident(
  p_incident_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.work_incidents%rowtype;
  v_note text;
begin
  if p_incident_id is null then
    raise exception 'incident_id fehlt.';
  end if;

  if not public.has_any_role(array['admin', 'buchhaltung']::public.app_role[]) then
    raise exception 'Keine Berechtigung fuer report_work_incident.';
  end if;

  select *
    into v_incident
  from public.work_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Unfallfall nicht gefunden: %', p_incident_id;
  end if;

  if v_incident.status = 'closed' then
    raise exception 'Geschlossener Unfallfall kann nicht gemeldet werden.';
  end if;

  perform set_config('app.allow_work_incident_status_update', '1', true);
  begin
    update public.work_incidents
       set status = 'reported',
           reported_to_insurer_at = coalesce(reported_to_insurer_at, now())
     where id = p_incident_id;
  exception when others then
    perform set_config('app.allow_work_incident_status_update', '0', true);
    raise;
  end;
  perform set_config('app.allow_work_incident_status_update', '0', true);

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null then
    perform public.log_work_incident_event(
      p_incident_id,
      'note',
      v_note,
      jsonb_build_object('source', 'report_work_incident')
    );
  end if;

  perform public.log_audit_event(
    'work_incident.reported',
    'work_incidents',
    p_incident_id,
    jsonb_build_object('note', coalesce(v_note, ''))
  );
end;
$$;

revoke all on function public.report_work_incident(uuid, text) from public;
grant execute on function public.report_work_incident(uuid, text) to authenticated;
grant execute on function public.report_work_incident(uuid, text) to service_role;

create or replace function public.close_work_incident(
  p_incident_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.work_incidents%rowtype;
  v_reason text;
begin
  if p_incident_id is null then
    raise exception 'incident_id fehlt.';
  end if;

  if not public.has_role('admin') then
    raise exception 'Keine Berechtigung fuer close_work_incident.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Abschlussgrund fehlt.';
  end if;

  select *
    into v_incident
  from public.work_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Unfallfall nicht gefunden: %', p_incident_id;
  end if;

  if v_incident.status = 'closed' then
    return;
  end if;

  perform set_config('app.allow_work_incident_status_update', '1', true);
  begin
    update public.work_incidents
       set status = 'closed',
           close_reason = v_reason
     where id = p_incident_id;
  exception when others then
    perform set_config('app.allow_work_incident_status_update', '0', true);
    raise;
  end;
  perform set_config('app.allow_work_incident_status_update', '0', true);

  perform public.log_audit_event(
    'work_incident.closed',
    'work_incidents',
    p_incident_id,
    jsonb_build_object('reason', v_reason)
  );
end;
$$;

revoke all on function public.close_work_incident(uuid, text) from public;
grant execute on function public.close_work_incident(uuid, text) to authenticated;
grant execute on function public.close_work_incident(uuid, text) to service_role;

create or replace view public.work_incident_kpi_monthly as
with base as (
  select
    wi.created_by,
    date_trunc('month', wi.incident_date)::date as month,
    wi.severity,
    wi.status,
    case
      when wi.absence_from is not null
       and wi.absence_to is not null
       and wi.absence_to >= wi.absence_from
      then (wi.absence_to - wi.absence_from + 1)
      else 0
    end::int as absence_days,
    case
      when wi.status = 'closed'
      then greatest((wi.updated_at::date - wi.incident_date), 0)
      else null
    end::int as resolution_days
  from public.work_incidents wi
)
select
  created_by,
  month,
  count(*)::int as incidents_total,
  count(*) filter (where severity in ('schwer', 'kritisch'))::int as incidents_severe_critical,
  coalesce(sum(absence_days), 0)::int as absence_days_total,
  count(*) filter (where status <> 'closed')::int as incidents_open,
  round(avg(resolution_days)::numeric, 2) as avg_resolution_days
from base
group by created_by, month;

grant select on public.work_incident_kpi_monthly to authenticated;
grant select on public.work_incident_kpi_monthly to service_role;

commit;
