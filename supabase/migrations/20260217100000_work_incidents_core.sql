-- Core schema for work incidents (MIG-1)

begin;

create table if not exists public.work_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),

  employee_user_id uuid not null references public.app_users(id) on delete restrict,
  incident_no text not null,

  incident_date date not null,
  incident_time time,
  incident_type text not null,
  severity text not null,
  location text not null,
  description text not null,

  injury_type text,
  body_part text,
  witnesses text[] not null default '{}'::text[],

  medical_visit_required boolean not null default false,
  work_incapacity_percent int not null default 0,
  absence_from date,
  absence_to date,

  insurer_name text,
  insurer_case_no text,
  reported_to_insurer_at timestamptz,

  status text not null default 'draft',
  close_reason text,

  constraint chk_work_incidents_type
    check (incident_type in ('berufsunfall', 'nichtberufsunfall', 'berufskrankheit', 'beinaheunfall')),
  constraint chk_work_incidents_severity
    check (severity in ('leicht', 'mittel', 'schwer', 'kritisch')),
  constraint chk_work_incidents_status
    check (status in ('draft', 'reported', 'in_treatment', 'closed')),
  constraint chk_work_incidents_work_incapacity_percent
    check (work_incapacity_percent between 0 and 100),
  constraint chk_work_incidents_absence_range
    check (absence_from is null or absence_to is null or absence_to >= absence_from)
);

create index if not exists idx_work_incidents_created_by
  on public.work_incidents (created_by);

create index if not exists idx_work_incidents_employee_user_id
  on public.work_incidents (employee_user_id);

create index if not exists idx_work_incidents_status_incident_date
  on public.work_incidents (status, incident_date desc);

create unique index if not exists ux_work_incidents_created_by_incident_no
  on public.work_incidents (created_by, incident_no);

create or replace function public.next_work_incident_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_year text := to_char(current_date, 'YYYY');
  v_next int;
begin
  v_owner := auth.uid();
  if v_owner is null then
    raise exception 'next_work_incident_no requires authenticated user';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('work_incidents_no'),
    hashtext(v_owner::text || ':' || v_year)
  );

  select coalesce(max((regexp_match(incident_no, '([0-9]+)$'))[1]::int), 0) + 1
  into v_next
  from public.work_incidents
  where created_by = v_owner
    and incident_no ~ ('^INC-' || v_year || '-[0-9]{6}$');

  return 'INC-' || v_year || '-' || lpad(v_next::text, 6, '0');
end;
$$;

revoke all on function public.next_work_incident_no() from public;
grant execute on function public.next_work_incident_no() to authenticated;
grant execute on function public.next_work_incident_no() to service_role;

alter table public.work_incidents
  alter column incident_no set default public.next_work_incident_no();

drop trigger if exists trg_work_incidents_updated_at on public.work_incidents;
create trigger trg_work_incidents_updated_at
before update on public.work_incidents
for each row
execute function public.set_updated_at();

alter table public.work_incidents enable row level security;

drop policy if exists work_incidents_select_roles on public.work_incidents;
create policy work_incidents_select_roles on public.work_incidents
for select using (
  public.has_any_role(array['admin','buchhaltung','read_only']::public.app_role[])
);

drop policy if exists work_incidents_insert_roles on public.work_incidents;
create policy work_incidents_insert_roles on public.work_incidents
for insert with check (
  public.has_any_role(array['admin','buchhaltung']::public.app_role[])
  and created_by = auth.uid()
);

drop policy if exists work_incidents_update_admin on public.work_incidents;
create policy work_incidents_update_admin on public.work_incidents
for update using (public.has_role('admin'))
with check (public.has_role('admin'));

drop policy if exists work_incidents_update_buchhaltung on public.work_incidents;
create policy work_incidents_update_buchhaltung on public.work_incidents
for update using (public.has_role('buchhaltung'))
with check (
  public.has_role('buchhaltung')
  and status in ('draft', 'reported', 'in_treatment')
);

drop policy if exists work_incidents_delete_admin on public.work_incidents;
create policy work_incidents_delete_admin on public.work_incidents
for delete using (public.has_role('admin'));

commit;
