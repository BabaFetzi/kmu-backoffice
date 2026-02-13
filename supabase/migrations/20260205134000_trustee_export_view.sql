-- Trustee export view (OP + payments)

begin;

DROP VIEW IF EXISTS public.trustee_export_view;
CREATE VIEW public.trustee_export_view AS
SELECT
  'open_item'::text AS record_type,
  o.id AS order_id,
  o.invoice_no,
  o.order_no,
  c.company_name AS customer_name,
  o.gross_total AS amount,
  o.currency,
  o.invoice_date AS event_date,
  o.due_date,
  o.payment_status,
  NULL::text AS method
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE o.document_type = 'invoice'
  AND o.payment_status IN ('open','partial','overdue')
  AND COALESCE(o.document_archived, false) = false

UNION ALL

SELECT
  'payment'::text AS record_type,
  p.order_id,
  o.invoice_no,
  o.order_no,
  c.company_name AS customer_name,
  p.amount,
  p.currency,
  p.paid_at::date AS event_date,
  o.due_date,
  o.payment_status,
  p.method
FROM public.payments p
JOIN public.orders o ON o.id = p.order_id
LEFT JOIN public.customers c ON c.id = o.customer_id;

commit;
