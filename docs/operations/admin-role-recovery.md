# Admin Role Recovery

## Zweck

Wenn die eigene `admin`-Rolle versehentlich entfernt wurde, kann sie mit einem sicheren SQL-Block wieder gesetzt werden.

## SQL (Supabase SQL Editor)

```sql
begin;

-- 1) Eigene User-ID einsetzen
-- Beispiel: 'f3ef397f-9f3c-42e3-8572-aee5f6a4f51b'
insert into public.user_roles (user_id, role)
values ('YOUR_USER_UUID'::uuid, 'admin'::public.app_role)
on conflict (user_id, role) do nothing;

commit;
```

## Verifikation

```sql
select user_id, role
from public.user_roles
where user_id = 'YOUR_USER_UUID'::uuid
order by role;
```

Erwartung: mindestens eine Zeile mit `role = admin`.
