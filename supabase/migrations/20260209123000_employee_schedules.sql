-- Employee schedules (Stundenplan) module

begin;

create table if not exists public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  employee_user_id uuid references public.app_users(id) on delete set null,
  employee_name text not null,
  weekday int not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  location text,
  notes text,
  is_active boolean not null default true,
  constraint employee_schedules_time_check check (start_time < end_time)
);

create index if not exists idx_employee_schedules_weekday on public.employee_schedules(weekday, is_active);
create index if not exists idx_employee_schedules_employee_user on public.employee_schedules(employee_user_id);
create index if not exists idx_employee_schedules_created_by on public.employee_schedules(created_by);

drop trigger if exists trg_employee_schedules_updated_at on public.employee_schedules;
create trigger trg_employee_schedules_updated_at
before update on public.employee_schedules
for each row
execute function public.set_updated_at();

alter table public.employee_schedules enable row level security;

drop policy if exists employee_schedules_select_roles on public.employee_schedules;
create policy employee_schedules_select_roles on public.employee_schedules
for select using (
  public.has_any_role(array['admin','read_only','buchhaltung','lager','einkauf']::public.app_role[])
);

drop policy if exists employee_schedules_insert_roles on public.employee_schedules;
create policy employee_schedules_insert_roles on public.employee_schedules
for insert with check (
  public.has_any_role(array['admin','buchhaltung']::public.app_role[])
);

drop policy if exists employee_schedules_update_roles on public.employee_schedules;
create policy employee_schedules_update_roles on public.employee_schedules
for update using (
  public.has_any_role(array['admin','buchhaltung']::public.app_role[])
) with check (
  public.has_any_role(array['admin','buchhaltung']::public.app_role[])
);

drop policy if exists employee_schedules_delete_roles on public.employee_schedules;
create policy employee_schedules_delete_roles on public.employee_schedules
for delete using (
  public.has_any_role(array['admin','buchhaltung']::public.app_role[])
);

commit;

