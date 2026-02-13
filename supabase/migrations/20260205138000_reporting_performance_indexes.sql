-- Reporting and document performance indexes

begin;

-- Documents list (orders with invoice or credit note)
create index if not exists idx_orders_documents_created_at
  on public.orders (created_at desc)
  where invoice_no is not null or credit_note_no is not null;

create index if not exists idx_orders_documents_type_status
  on public.orders (document_type, payment_status, created_at desc);

create index if not exists idx_orders_documents_archive
  on public.orders (document_archived, created_at desc);

-- Open items / dunning scans
create index if not exists idx_orders_open_items_due
  on public.orders (due_date, payment_status)
  where document_type = 'invoice' and coalesce(document_archived, false) = false;

create index if not exists idx_orders_dunning_batch
  on public.orders (dunning_level, dunning_last_at, due_date)
  where document_type = 'invoice' and coalesce(document_archived, false) = false;

-- VAT/report joins
create index if not exists idx_order_lines_order_vat
  on public.order_lines (order_id, vat_code, vat_rate);

create index if not exists idx_orders_invoice_dates
  on public.orders (invoice_date, credit_note_date, order_date);

-- Timeline view support
create index if not exists idx_audit_log_orders_timeline
  on public.audit_log (entity, entity_id, created_at desc);

create index if not exists idx_payments_order_paid_at_desc
  on public.payments (order_id, paid_at desc);

create index if not exists idx_dunning_log_order_created_desc
  on public.dunning_log (order_id, created_at desc);

commit;
