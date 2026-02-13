-- Bank import idempotency: prevent duplicate BANKCSV payment markers per order

begin;

create unique index if not exists ux_payments_bankcsv_marker_per_order
  on public.payments (order_id, upper(note))
  where note is not null
    and upper(note) like 'BANKCSV|%';

commit;
