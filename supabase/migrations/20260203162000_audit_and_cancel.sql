-- Audit views + cancel-after-done RPC

begin;

-- 1) Order line fulfillment audit view
DROP VIEW IF EXISTS public.order_line_fulfillment_audit;
CREATE VIEW public.order_line_fulfillment_audit AS
SELECT
  o.id AS order_id,
  o.order_no,
  o.status AS order_status,
  ol.id AS order_line_id,
  ol.item_id,
  i.name AS item_name,
  ol.qty AS ordered_qty,
  COALESCE(SUM(CASE WHEN sm.reason_code = 'sale' THEN sm.qty ELSE 0 END), 0) AS delivered_qty,
  COALESCE(SUM(CASE WHEN sm.reason_code = 'return' THEN sm.qty ELSE 0 END), 0) AS returned_qty,
  GREATEST(
    COALESCE(SUM(CASE WHEN sm.reason_code = 'sale' THEN sm.qty ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN sm.reason_code = 'return' THEN sm.qty ELSE 0 END), 0),
    0
  ) AS net_qty,
  MAX(sm.created_at) AS last_movement_at
FROM public.order_lines ol
JOIN public.orders o ON o.id = ol.order_id
JOIN public.items i ON i.id = ol.item_id
LEFT JOIN public.stock_movements sm ON sm.order_line_id = ol.id
GROUP BY o.id, o.order_no, o.status, ol.id, ol.item_id, i.name, ol.qty;

-- 2) Order fulfillment summary view
DROP VIEW IF EXISTS public.order_fulfillment_audit;
CREATE VIEW public.order_fulfillment_audit AS
SELECT
  order_id,
  order_no,
  order_status,
  SUM(ordered_qty) AS ordered_qty,
  SUM(delivered_qty) AS delivered_qty,
  SUM(returned_qty) AS returned_qty,
  SUM(net_qty) AS net_qty,
  MAX(last_movement_at) AS last_movement_at
FROM public.order_line_fulfillment_audit
GROUP BY order_id, order_no, order_status;

-- 3) Cancel-after-done: reverse stock and mark storno
CREATE OR REPLACE FUNCTION public.cancel_order_after_done(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order nicht gefunden: %', p_order_id;
  END IF;

  IF v_order.status NOT IN ('done','retoure') THEN
    RAISE EXCEPTION 'Storno nach DONE nur erlaubt bei DONE/RETOURE (aktuell: %).', v_order.status;
  END IF;

  IF COALESCE(v_order.stock_applied,false) = false THEN
    RAISE EXCEPTION 'Storno nach DONE nicht möglich: stock_applied=false.';
  END IF;

  -- Reverse movements (idempotent via booking_key)
  INSERT INTO public.stock_movements (
    item_id,
    movement_type,
    qty,
    unit,
    reason_code,
    booking_key,
    order_id,
    order_line_id,
    notes,
    created_by
  )
  SELECT
    ol.item_id,
    'in',
    ol.qty,
    COALESCE(ol.unit, 'pcs'),
    'cancel',
    'cancel:' || ol.id,
    v_order.id,
    ol.id,
    'Storno nach DONE',
    v_order.created_by
  FROM public.order_lines ol
  WHERE ol.order_id = p_order_id
  ON CONFLICT (booking_key) DO NOTHING;

  PERFORM set_config('app.allow_order_status_update', '1', true);

  UPDATE public.orders
  SET status = 'storno',
      stock_reversed = true
  WHERE id = p_order_id;
END;
$$;

commit;
