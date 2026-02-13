-- VAT (MWST) report view by month and rate

begin;

DROP VIEW IF EXISTS public.report_vat_by_rate_monthly;
CREATE VIEW public.report_vat_by_rate_monthly AS
SELECT
  date_trunc('month', COALESCE(o.invoice_date, o.credit_note_date, o.order_date, o.created_at))::date AS month,
  COALESCE(ol.vat_code, 'CH_STD') AS vat_code,
  COALESCE(ol.vat_rate, 0) AS vat_rate,
  SUM(CASE WHEN o.document_type = 'credit_note' THEN -1 ELSE 1 END * COALESCE(ol.net_amount, 0)) AS net_total,
  SUM(CASE WHEN o.document_type = 'credit_note' THEN -1 ELSE 1 END * COALESCE(ol.vat_amount, 0)) AS vat_total,
  SUM(CASE WHEN o.document_type = 'credit_note' THEN -1 ELSE 1 END * COALESCE(ol.gross_amount, 0)) AS gross_total
FROM public.orders o
JOIN public.order_lines ol ON ol.order_id = o.id
WHERE o.invoice_no IS NOT NULL OR o.credit_note_no IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 3 DESC;

commit;
