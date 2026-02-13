-- Purchase order sending + ordered status

begin;

-- 1) Add send tracking
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to text,
  ADD COLUMN IF NOT EXISTS sent_by uuid;

-- 2) Allow status "ordered"
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['open','ordered','received','cancelled']));

-- 3) Receive RPC: allow open or ordered
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
BEGIN
  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Einkauf nicht gefunden: %', p_order_id;
  END IF;

  IF v_order.status NOT IN ('open','ordered') THEN
    RAISE EXCEPTION 'Einkauf muss OPEN/ORDERED sein (aktuell: %).', v_order.status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_lines WHERE purchase_order_id = p_order_id) THEN
    RAISE EXCEPTION 'Einkauf % hat keine Positionen.', p_order_id;
  END IF;

  INSERT INTO public.stock_movements (
    item_id,
    movement_type,
    qty,
    unit,
    reason_code,
    booking_key,
    notes,
    created_by
  )
  SELECT
    pol.item_id,
    'in',
    pol.qty,
    COALESCE(pol.unit, 'pcs'),
    'purchase',
    'purchase:' || pol.id,
    COALESCE(v_order.notes, ''),
    v_order.created_by
  FROM public.purchase_order_lines pol
  WHERE pol.purchase_order_id = p_order_id
  ON CONFLICT (booking_key) DO NOTHING;

  UPDATE public.purchase_orders
  SET status = 'received',
      received_at = now()
  WHERE id = p_order_id;
END;
$$;

commit;
