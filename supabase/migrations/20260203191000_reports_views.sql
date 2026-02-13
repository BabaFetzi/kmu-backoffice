-- Reports views

begin;

-- 1) Monthly sales (gross)
DROP VIEW IF EXISTS public.report_sales_monthly;
CREATE VIEW public.report_sales_monthly AS
SELECT
  date_trunc('month', COALESCE(invoice_date, order_date, created_at))::date AS month,
  SUM(COALESCE(gross_total, total_chf, 0)) AS gross_total,
  SUM(COALESCE(net_total, 0)) AS net_total,
  SUM(COALESCE(vat_total, 0)) AS vat_total,
  COUNT(*) AS orders_count
FROM public.orders
WHERE status IN ('done','retoure')
GROUP BY 1
ORDER BY 1 DESC;

-- 2) Top items by sold qty
DROP VIEW IF EXISTS public.report_top_items;
CREATE VIEW public.report_top_items AS
SELECT
  sm.item_id,
  i.name AS item_name,
  SUM(CASE WHEN sm.reason_code = 'sale' THEN sm.qty ELSE 0 END) AS sold_qty,
  SUM(CASE WHEN sm.reason_code = 'return' THEN sm.qty ELSE 0 END) AS returned_qty
FROM public.stock_movements sm
JOIN public.items i ON i.id = sm.item_id
GROUP BY sm.item_id, i.name
ORDER BY sold_qty DESC NULLS LAST;

-- 3) Return rate (overall)
DROP VIEW IF EXISTS public.report_return_rate;
CREATE VIEW public.report_return_rate AS
SELECT
  COALESCE(SUM(CASE WHEN reason_code = 'sale' THEN qty ELSE 0 END), 0) AS sold_qty,
  COALESCE(SUM(CASE WHEN reason_code = 'return' THEN qty ELSE 0 END), 0) AS returned_qty,
  CASE
    WHEN COALESCE(SUM(CASE WHEN reason_code = 'sale' THEN qty ELSE 0 END), 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(SUM(CASE WHEN reason_code = 'return' THEN qty ELSE 0 END), 0)
      / COALESCE(SUM(CASE WHEN reason_code = 'sale' THEN qty ELSE 0 END), 0)) * 100, 2
    )
  END AS return_rate_pct
FROM public.stock_movements;

-- 4) Purchases by supplier
DROP VIEW IF EXISTS public.report_purchases_by_supplier;
CREATE VIEW public.report_purchases_by_supplier AS
SELECT
  po.supplier_id,
  s.company_name AS supplier_name,
  SUM(pol.qty * COALESCE(pol.unit_cost,0)) AS purchase_total,
  COUNT(DISTINCT po.id) AS orders_count
FROM public.purchase_orders po
JOIN public.suppliers s ON s.id = po.supplier_id
JOIN public.purchase_order_lines pol ON pol.purchase_order_id = po.id
WHERE po.status IN ('open','ordered','received')
GROUP BY po.supplier_id, s.company_name
ORDER BY purchase_total DESC NULLS LAST;

commit;
