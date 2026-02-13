-- Dunning log export view

begin;

DROP VIEW IF EXISTS public.dunning_log_export_view;
CREATE VIEW public.dunning_log_export_view AS
SELECT
  d.id,
  d.created_at,
  d.order_id,
  o.invoice_no,
  o.order_no,
  c.company_name AS customer_name,
  d.level,
  d.note
FROM public.dunning_log d
JOIN public.orders o ON o.id = d.order_id
LEFT JOIN public.customers c ON c.id = o.customer_id;

commit;
