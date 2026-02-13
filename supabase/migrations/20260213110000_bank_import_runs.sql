-- Bank import run reports: operational traceability per CSV batch

begin;

create table if not exists public.bank_import_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),

  source_file text,

  total_rows int not null default 0 check (total_rows >= 0),
  matched_rows int not null default 0 check (matched_rows >= 0),
  ambiguous_rows int not null default 0 check (ambiguous_rows >= 0),
  unmatched_rows int not null default 0 check (unmatched_rows >= 0),
  ignored_rows int not null default 0 check (ignored_rows >= 0),
  invalid_rows int not null default 0 check (invalid_rows >= 0),

  selected_rows int not null default 0 check (selected_rows >= 0),
  booked_rows int not null default 0 check (booked_rows >= 0),
  duplicate_rows int not null default 0 check (duplicate_rows >= 0),
  failed_rows int not null default 0 check (failed_rows >= 0),

  parse_error_count int not null default 0 check (parse_error_count >= 0),
  errors_preview jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_bank_import_runs_created_at_desc
  on public.bank_import_runs (created_at desc);

create index if not exists idx_bank_import_runs_created_by
  on public.bank_import_runs (created_by);

alter table public.bank_import_runs enable row level security;

drop policy if exists bank_import_runs_select_roles on public.bank_import_runs;
create policy bank_import_runs_select_roles on public.bank_import_runs
for select using (public.has_any_role(array['admin','read_only','buchhaltung']::public.app_role[]));

drop policy if exists bank_import_runs_insert_roles on public.bank_import_runs;
create policy bank_import_runs_insert_roles on public.bank_import_runs
for insert with check (public.has_any_role(array['admin','buchhaltung']::public.app_role[]));

commit;
