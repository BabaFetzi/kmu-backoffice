-- Debitoren / Kreditoren Summenlisten

begin;

DROP VIEW IF EXISTS public.report_ar_summary;
CREATE VIEW public.report_ar_summary AS
SELECT
  c.id AS customer_id,
  c.company_name AS customer_name,
  SUM(o.gross_total) AS open_total,
  COUNT(*) AS invoices_count
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id
WHERE o.document_type = 'invoice'
  AND o.payment_status IN ('open','partial','overdue')
  AND COALESCE(o.document_archived, false) = false
GROUP BY c.id, c.company_name
ORDER BY open_total DESC;

DROP VIEW IF EXISTS public.report_ap_summary;
CREATE VIEW public.report_ap_summary AS
SELECT
  s.id AS supplier_id,
  s.company_name AS supplier_name,
  SUM(COALESCE(pol.qty,0) * COALESCE(pol.unit_cost,0)) AS open_total,
  COUNT(DISTINCT po.id) AS orders_count
FROM public.purchase_orders po
JOIN public.suppliers s ON s.id = po.supplier_id
JOIN public.purchase_order_lines pol ON pol.purchase_order_id = po.id
WHERE po.status IN ('open','ordered')
GROUP BY s.id, s.company_name
ORDER BY open_total DESC;

commit;
