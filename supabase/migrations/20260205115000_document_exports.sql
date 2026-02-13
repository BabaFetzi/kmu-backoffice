-- Document exports (CSV views)

begin;

DROP VIEW IF EXISTS public.invoice_export_view;
CREATE VIEW public.invoice_export_view AS
SELECT
  o.id AS order_id,
  o.order_no,
  o.invoice_no,
  o.invoice_date,
  o.due_date,
  o.payment_status,
  o.net_total,
  o.vat_total,
  o.gross_total,
  o.currency,
  c.company_name AS customer_name,
  c.street AS customer_street,
  c.zip AS customer_zip,
  c.city AS customer_city,
  c.country AS customer_country
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE o.invoice_no IS NOT NULL;

DROP VIEW IF EXISTS public.credit_note_export_view;
CREATE VIEW public.credit_note_export_view AS
SELECT
  o.id AS order_id,
  o.order_no,
  o.credit_note_no,
  o.credit_note_date,
  o.net_total,
  o.vat_total,
  o.gross_total,
  o.currency,
  c.company_name AS customer_name,
  c.street AS customer_street,
  c.zip AS customer_zip,
  c.city AS customer_city,
  c.country AS customer_country
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE o.credit_note_no IS NOT NULL;

commit;
