-- Row-level details for each bank import run

begin;

create table if not exists public.bank_import_run_rows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.bank_import_runs(id) on delete cascade,

  row_no int not null default 0 check (row_no >= 0),
  booking_date date,
  amount numeric(12,2),
  currency text not null default 'CHF',
  reference text,
  message text,
  counterparty text,

  raw_status text not null,
  effective_status text not null,
  selected boolean not null default false,
  processing_result text not null,
  error_text text,
  match_strategy text,

  matched_order_id uuid references public.orders(id) on delete set null,
  matched_invoice_no text,
  matched_order_no text,
  is_manual boolean not null default false,
  parse_issues jsonb not null default '[]'::jsonb
);

create index if not exists idx_bank_import_run_rows_run_rowno
  on public.bank_import_run_rows (run_id, row_no);

create index if not exists idx_bank_import_run_rows_result
  on public.bank_import_run_rows (processing_result);

alter table public.bank_import_run_rows enable row level security;

drop policy if exists bank_import_run_rows_select_roles on public.bank_import_run_rows;
create policy bank_import_run_rows_select_roles on public.bank_import_run_rows
for select using (public.has_any_role(array['admin','read_only','buchhaltung']::public.app_role[]));

drop policy if exists bank_import_run_rows_insert_roles on public.bank_import_run_rows;
create policy bank_import_run_rows_insert_roles on public.bank_import_run_rows
for insert with check (public.has_any_role(array['admin','buchhaltung']::public.app_role[]));

commit;
