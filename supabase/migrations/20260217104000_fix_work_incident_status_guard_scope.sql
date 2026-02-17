-- Hotfix: prevent lingering workflow guard flag from bypassing direct status updates

begin;

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

commit;
