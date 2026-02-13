-- Open items aging view

begin;

DROP VIEW IF EXISTS public.open_items_aging_view;
CREATE VIEW public.open_items_aging_view AS
SELECT
  o.id AS order_id,
  o.invoice_no,
  o.order_no,
  o.customer_id,
  c.company_name AS customer_name,
  o.gross_total,
  o.currency,
  o.invoice_date,
  o.due_date,
  o.payment_status,
  GREATEST(CURRENT_DATE - o.due_date, 0) AS days_overdue,
  CASE
    WHEN o.due_date IS NULL THEN 'no_due_date'
    WHEN CURRENT_DATE <= o.due_date THEN 'not_due'
    WHEN CURRENT_DATE - o.due_date BETWEEN 1 AND 30 THEN '1_30'
    WHEN CURRENT_DATE - o.due_date BETWEEN 31 AND 60 THEN '31_60'
    WHEN CURRENT_DATE - o.due_date BETWEEN 61 AND 90 THEN '61_90'
    ELSE '90_plus'
  END AS aging_bucket
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
WHERE o.document_type = 'invoice'
  AND o.payment_status IN ('open','overdue')
  AND COALESCE(o.document_archived, false) = false;

commit;
