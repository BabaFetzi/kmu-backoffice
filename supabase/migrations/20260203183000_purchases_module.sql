-- Purchasing module (Einkauf + Wareneingang)

begin;

-- 1) Extend reason enum for stock movements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'stock_movement_reason'
      AND e.enumlabel = 'purchase'
  ) THEN
    ALTER TYPE public.stock_movement_reason ADD VALUE 'purchase';
  END IF;
END $$;

-- 2) Purchase orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),

  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open',
  notes text,
  reference_no text,
  received_at timestamptz
);

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status = ANY (ARRAY['open','received','cancelled']));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);

-- 3) Purchase order lines
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),

  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  qty numeric NOT NULL CHECK (qty > 0),
  unit text NOT NULL DEFAULT 'pcs',
  unit_cost numeric(12,2),
  currency text NOT NULL DEFAULT 'CHF',
  notes text
);

CREATE INDEX IF NOT EXISTS idx_po_lines_order ON public.purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_lines_item ON public.purchase_order_lines(item_id);

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 5) RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_select_own ON public.purchase_orders;
CREATE POLICY purchase_orders_select_own ON public.purchase_orders
FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS purchase_orders_insert_own ON public.purchase_orders;
CREATE POLICY purchase_orders_insert_own ON public.purchase_orders
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS purchase_orders_update_own ON public.purchase_orders;
CREATE POLICY purchase_orders_update_own ON public.purchase_orders
FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS purchase_orders_delete_own ON public.purchase_orders;
CREATE POLICY purchase_orders_delete_own ON public.purchase_orders
FOR DELETE USING (created_by = auth.uid());

DROP POLICY IF EXISTS purchase_order_lines_select_own ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_select_own ON public.purchase_order_lines
FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS purchase_order_lines_insert_own ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_insert_own ON public.purchase_order_lines
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS purchase_order_lines_update_own ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_update_own ON public.purchase_order_lines
FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS purchase_order_lines_delete_own ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_delete_own ON public.purchase_order_lines
FOR DELETE USING (created_by = auth.uid());

-- 6) RPC: Receive purchase order (Wareneingang)
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

  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Einkauf muss OPEN sein (aktuell: %).', v_order.status;
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
