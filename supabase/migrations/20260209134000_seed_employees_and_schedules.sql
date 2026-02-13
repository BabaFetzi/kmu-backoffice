-- Seed: 4 employees + weekly default schedules

begin;

-- 1) App users for employee cards in Stundenplan
insert into public.app_users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'luca.meier@backoffice.local'),
  ('22222222-2222-4222-8222-222222222222', 'sara.keller@backoffice.local'),
  ('33333333-3333-4333-8333-333333333333', 'noah.baumann@backoffice.local'),
  ('44444444-4444-4444-8444-444444444444', 'mia.frei@backoffice.local')
on conflict (id) do update
set email = excluded.email;

-- 2) Optional roles for visibility and future assignments
insert into public.user_roles (user_id, role)
values
  ('11111111-1111-4111-8111-111111111111', 'lager'),
  ('22222222-2222-4222-8222-222222222222', 'einkauf'),
  ('33333333-3333-4333-8333-333333333333', 'buchhaltung'),
  ('44444444-4444-4444-8444-444444444444', 'read_only')
on conflict (user_id, role) do nothing;

-- 3) Weekly schedules (Mon-Fri) idempotent insert
with schedule_seed(employee_user_id, employee_name, weekday, start_time, end_time, location, notes) as (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'Luca Meier', 1, '08:00'::time, '17:00'::time, 'Lager', 'Wareneingang/Kommissionierung'),
    ('11111111-1111-4111-8111-111111111111'::uuid, 'Luca Meier', 3, '08:00'::time, '17:00'::time, 'Lager', 'Inventur und Versand'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'Sara Keller', 2, '08:30'::time, '17:30'::time, 'Einkauf', 'Lieferanten und Bestellungen'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'Sara Keller', 4, '08:30'::time, '17:30'::time, 'Einkauf', 'Wareneingangsplanung'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'Noah Baumann', 1, '09:00'::time, '18:00'::time, 'Buchhaltung', 'Zahlungen und OP-Abgleich'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'Noah Baumann', 5, '09:00'::time, '16:00'::time, 'Buchhaltung', 'Abschluss und Reports'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'Mia Frei', 3, '10:00'::time, '16:00'::time, 'Frontoffice', 'Stammdatenpflege'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'Mia Frei', 5, '10:00'::time, '15:00'::time, 'Frontoffice', 'Dokumentation und QA')
),
owner_pick as (
  select ur.user_id as id
  from public.user_roles ur
  where ur.role = 'admin'
  limit 1
),
fallback_pick as (
  select au.id
  from public.app_users au
  limit 1
),
resolved_owner as (
  select coalesce((select id from owner_pick), (select id from fallback_pick)) as id
)
insert into public.employee_schedules (
  created_by,
  employee_user_id,
  employee_name,
  weekday,
  start_time,
  end_time,
  location,
  notes,
  is_active
)
select
  ro.id,
  s.employee_user_id,
  s.employee_name,
  s.weekday,
  s.start_time,
  s.end_time,
  s.location,
  s.notes,
  true
from schedule_seed s
cross join resolved_owner ro
where ro.id is not null
  and not exists (
    select 1
    from public.employee_schedules es
    where es.employee_user_id = s.employee_user_id
      and es.weekday = s.weekday
      and es.start_time = s.start_time
      and es.end_time = s.end_time
  );

do $$
declare
  v_cnt int;
begin
  select count(*) into v_cnt
  from public.employee_schedules es
  where es.employee_user_id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid,
    '44444444-4444-4444-8444-444444444444'::uuid
  );

  if v_cnt = 0 then
    raise exception 'Seed failed: no employee schedules inserted (missing admin/app_user owner).';
  end if;
end $$;

commit;
