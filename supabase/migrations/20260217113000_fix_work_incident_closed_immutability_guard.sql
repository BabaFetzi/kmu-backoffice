-- Fix: closed work incidents must be immutable regardless of session flags

begin;

create or replace function public.guard_work_incident_update() returns trigger
language plpgsql
as $$
begin
  -- Closed incidents are immutable. Workflow RPCs only transition TO closed,
  -- so updates on already-closed rows must always fail.
  if old.status = 'closed' then
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

commit;
