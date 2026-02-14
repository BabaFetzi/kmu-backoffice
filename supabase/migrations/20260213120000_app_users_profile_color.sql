-- Assign a deterministic profile color to every employee user

begin;

alter table public.app_users
  add column if not exists profile_color text;

create or replace function public.pick_employee_profile_color(seed text)
returns text
language sql
immutable
as $$
  select (
    array[
      '#38BDF8',
      '#34D399',
      '#F59E0B',
      '#F472B6',
      '#818CF8',
      '#14B8A6',
      '#FB7185',
      '#22D3EE',
      '#A3E635',
      '#F97316',
      '#2DD4BF',
      '#60A5FA'
    ]
  )[1 + (((hashtext(coalesce(seed, 'employee'))::bigint % 12) + 12) % 12)];
$$;

create or replace function public.set_app_user_profile_color()
returns trigger
language plpgsql
as $$
begin
  if new.profile_color is null
     or btrim(new.profile_color) = ''
     or new.profile_color !~ '^#[0-9A-Fa-f]{6}$' then
    new.profile_color := public.pick_employee_profile_color(coalesce(new.id::text, new.email, 'employee'));
  else
    new.profile_color := upper(new.profile_color);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_app_users_profile_color on public.app_users;
create trigger trg_app_users_profile_color
before insert or update on public.app_users
for each row
execute function public.set_app_user_profile_color();

update public.app_users
set profile_color = public.pick_employee_profile_color(coalesce(id::text, email, 'employee'))
where profile_color is null
   or btrim(profile_color) = ''
   or profile_color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.app_users
  drop constraint if exists app_users_profile_color_hex_check;

alter table public.app_users
  add constraint app_users_profile_color_hex_check
  check (profile_color ~ '^#[0-9A-F]{6}$');

alter table public.app_users
  alter column profile_color set not null;

commit;
