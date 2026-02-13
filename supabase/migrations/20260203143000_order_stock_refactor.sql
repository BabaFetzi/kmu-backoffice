-- Stock/order refactor for idempotent bookings + returns

begin;

-- 1) Reason enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_reason') THEN
    CREATE TYPE public.stock_movement_reason AS ENUM (
      'sale',
      'return',
      'cancel',
      'inventory',
      'correction'
    );
  END IF;
END $$;

-- 2) Returns table (partial returns)
CREATE TABLE IF NOT EXISTS public.order_line_returns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES public.order_lines(id) ON DELETE CASCADE,
  qty numeric NOT NULL CHECK (qty > 0),
  note text
);

CREATE INDEX IF NOT EXISTS idx_order_line_returns_line ON public.order_line_returns(order_line_id);
CREATE INDEX IF NOT EXISTS idx_order_line_returns_order ON public.order_line_returns(order_id);

-- 3) Stock movements new columns
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reason_code public.stock_movement_reason,
  ADD COLUMN IF NOT EXISTS qty_change numeric(12,2),
  ADD COLUMN IF NOT EXISTS booking_key text,
  ADD COLUMN IF NOT EXISTS order_return_id uuid;

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_order_return_fk,
  ADD CONSTRAINT stock_movements_order_return_fk
    FOREIGN KEY (order_return_id) REFERENCES public.order_line_returns(id) ON DELETE SET NULL;

-- 4) Backfill reason_code + qty_change for existing rows
UPDATE public.stock_movements
SET reason_code = CASE
  WHEN reason_code IS NOT NULL THEN reason_code
  WHEN movement_type = 'inventory' THEN 'inventory'
  WHEN movement_type = 'out' AND (
    reason ILIKE '%order%' OR reason ILIKE '%auftrag%' OR reference ILIKE 'AUF-%' OR reference ILIKE 'ORDER:%'
  ) THEN 'sale'
  WHEN movement_type = 'in' AND (
    reason ILIKE '%return%' OR reason ILIKE '%retour%' OR reference ILIKE 'RET:%'
  ) THEN 'return'
  WHEN movement_type = 'in' AND (
    reason ILIKE '%storno%' OR reference ILIKE 'STORNO:%'
  ) THEN 'cancel'
  WHEN movement_type IN ('in','out','adjust') THEN 'correction'
  ELSE 'correction'
END
WHERE reason_code IS NULL;

UPDATE public.stock_movements
SET qty_change = COALESCE(
  qty_change,
  delta_qty,
  CASE
    WHEN movement_type = 'in' THEN qty
    WHEN movement_type = 'out' THEN -qty
    WHEN movement_type = 'adjust' THEN COALESCE(delta_qty, qty)
    WHEN movement_type = 'inventory' THEN delta_qty
    ELSE NULL
  END
);

UPDATE public.stock_movements
SET qty_change = 0
WHERE qty_change IS NULL;

-- booking_key for existing sale movements
UPDATE public.stock_movements
SET booking_key = 'sale:' || order_line_id
WHERE booking_key IS NULL
  AND reason_code = 'sale'
  AND order_line_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movements_booking_key
  ON public.stock_movements(booking_key)
  WHERE booking_key IS NOT NULL;

-- 5) Replace stock movement triggers to use qty_change consistently
CREATE OR REPLACE FUNCTION public.prepare_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_stock numeric;
  v_qty numeric;
  v_delta numeric;
BEGIN
  v_qty := COALESCE(new.qty, 0);

  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'qty muss > 0 sein.';
  END IF;

  SELECT COALESCE(current_stock, 0)
    INTO v_stock
  FROM public.items
  WHERE id = new.item_id
  FOR UPDATE;

  -- default reason_code if missing
  IF new.reason_code IS NULL THEN
    IF new.movement_type = 'inventory' THEN
      new.reason_code := 'inventory';
    ELSE
      new.reason_code := 'correction';
    END IF;
  END IF;

  -- compute qty_change
  IF new.qty_change IS NULL THEN
    IF new.movement_type = 'in' THEN
      new.qty_change := v_qty;
    ELSIF new.movement_type = 'out' THEN
      new.qty_change := -v_qty;
    ELSIF new.movement_type = 'inventory' THEN
      new.qty_change := v_qty - v_stock;
    ELSIF new.movement_type = 'adjust' THEN
      v_delta := COALESCE(new.delta_qty, v_qty);
      new.qty_change := v_delta;
    ELSE
      RAISE EXCEPTION 'Unknown movement_type: %', new.movement_type;
    END IF;
  END IF;

  -- prevent negative stock
  IF (v_stock + new.qty_change) < 0 THEN
    RAISE EXCEPTION 'Nicht genug Bestand. Aktuell: %, Delta: %', v_stock, new.qty_change;
  END IF;

  -- keep delta_qty in sync
  IF new.delta_qty IS NULL THEN
    new.delta_qty := new.qty_change;
  END IF;

  IF new.unit IS NULL OR length(trim(new.unit)) = 0 THEN
    new.unit := 'pcs';
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.allow_item_stock_update', '1', true);

  UPDATE public.items
  SET current_stock = COALESCE(current_stock, 0) + COALESCE(new.qty_change, 0)
  WHERE id = new.item_id;

  RETURN new;
END;
$$;

-- 6) Guard: prevent direct current_stock changes
CREATE OR REPLACE FUNCTION public.guard_item_stock_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF new.current_stock IS DISTINCT FROM old.current_stock THEN
    IF current_setting('app.allow_item_stock_update', true) <> '1' THEN
      RAISE EXCEPTION 'current_stock ist read-only. Bitte nur via stock_movements buchen.';
    END IF;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_guard_stock ON public.items;
CREATE TRIGGER trg_items_guard_stock
BEFORE UPDATE OF current_stock ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.guard_item_stock_update();

-- 7) Order status workflow guard
CREATE OR REPLACE FUNCTION public.guard_order_status_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF old.status IS DISTINCT FROM new.status THEN
    IF current_setting('app.allow_order_status_update', true) <> '1' THEN
      RAISE EXCEPTION 'Order-Status darf nur via RPC geändert werden.';
    END IF;

    IF NOT (
      (old.status = 'open' AND new.status IN ('done','storno')) OR
      (old.status = 'done' AND new.status = 'retoure') OR
      (old.status = 'retoure' AND new.status = 'retoure')
    ) THEN
      RAISE EXCEPTION 'Unerlaubter Statuswechsel: % -> %', old.status, new.status;
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_guard ON public.orders;
CREATE TRIGGER trg_orders_status_guard
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_status_update();

-- 8) Order lines guard: no edits after done/retoure
CREATE OR REPLACE FUNCTION public.guard_order_lines_edit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := old.order_id;
  ELSE
    v_order_id := new.order_id;
  END IF;

  SELECT status INTO v_status FROM public.orders WHERE id = v_order_id;

  IF v_status IN ('done','retoure') THEN
    RAISE EXCEPTION 'Order-Lines sind nach DONE/RETOURE nicht editierbar.';
  END IF;

  RETURN COALESCE(new, old);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_lines_guard ON public.order_lines;
CREATE TRIGGER trg_order_lines_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_lines_edit();

-- 9) RPCs for workflow
CREATE OR REPLACE FUNCTION public.finalize_order(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
  r record;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order nicht gefunden: %', p_order_id;
  END IF;

  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Order muss OPEN sein (aktuell: %).', v_order.status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_lines WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Order % hat keine Positionen.', v_order.order_no;
  END IF;

  -- Bestand prüfen + Items locken
  FOR r IN
    SELECT ol.item_id, ol.qty, i.current_stock, i.name
    FROM public.order_lines ol
    JOIN public.items i ON i.id = ol.item_id
    WHERE ol.order_id = p_order_id
    FOR UPDATE OF i
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge in Order % (Item %).', v_order.order_no, r.name;
    END IF;

    IF COALESCE(r.current_stock,0) < r.qty THEN
      RAISE EXCEPTION 'Nicht genug Bestand für "%": verfügbar %, benötigt % (Order %).',
        r.name, COALESCE(r.current_stock,0), r.qty, v_order.order_no;
    END IF;
  END LOOP;

  -- Bewegungen schreiben (idempotent pro line)
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
    'out',
    ol.qty,
    COALESCE(ol.unit, 'pcs'),
    'sale',
    'sale:' || ol.id,
    v_order.id,
    ol.id,
    COALESCE(v_order.notes,''),
    v_order.created_by
  FROM public.order_lines ol
  WHERE ol.order_id = p_order_id
  ON CONFLICT (booking_key) DO NOTHING;

  PERFORM set_config('app.allow_order_status_update', '1', true);

  UPDATE public.orders
  SET status = 'done',
      stock_applied = true
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid) RETURNS void
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

  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Storno nur bei OPEN erlaubt (aktuell: %).', v_order.status;
  END IF;

  PERFORM set_config('app.allow_order_status_update', '1', true);

  UPDATE public.orders
  SET status = 'storno',
      stock_applied = false,
      stock_reversed = false
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.book_return(p_order_line_id uuid, p_qty numeric, p_note text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line record;
  v_order record;
  v_out numeric;
  v_returned numeric;
  v_return_id uuid;
  v_movement_id uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'p_qty muss > 0 sein';
  END IF;

  SELECT ol.*, o.status, o.stock_applied, o.id AS order_id, o.order_no, o.created_by
    INTO v_line
  FROM public.order_lines ol
  JOIN public.orders o ON o.id = ol.order_id
  WHERE ol.id = p_order_line_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_line_id nicht gefunden: %', p_order_line_id;
  END IF;

  IF v_line.status NOT IN ('done','retoure') THEN
    RAISE EXCEPTION 'Retoure nur bei DONE/RETOURE. Aktuell: %', v_line.status;
  END IF;

  IF COALESCE(v_line.stock_applied, false) = false THEN
    RAISE EXCEPTION 'Retoure nicht möglich: Lager wurde für diesen Auftrag noch nicht angewendet.';
  END IF;

  IF COALESCE(v_line.qty,0) <= 0 THEN
    RAISE EXCEPTION 'Ungültige Positionsmenge.';
  END IF;

  SELECT COALESCE(SUM(sm.qty),0)
    INTO v_out
  FROM public.stock_movements sm
  WHERE sm.order_line_id = p_order_line_id
    AND sm.reason_code = 'sale';

  SELECT COALESCE(SUM(sm.qty),0)
    INTO v_returned
  FROM public.stock_movements sm
  WHERE sm.order_line_id = p_order_line_id
    AND sm.reason_code = 'return';

  IF (v_returned + p_qty) > v_out THEN
    RAISE EXCEPTION 'Überretoure: bereits retour % + neu % > geliefert %', v_returned, p_qty, v_out;
  END IF;

  INSERT INTO public.order_line_returns (order_id, order_line_id, qty, note, created_by)
  VALUES (v_line.order_id, v_line.id, p_qty, p_note, COALESCE(auth.uid(), v_line.created_by))
  RETURNING id INTO v_return_id;

  INSERT INTO public.stock_movements (
    item_id,
    movement_type,
    qty,
    unit,
    reason_code,
    booking_key,
    order_id,
    order_line_id,
    order_return_id,
    notes,
    created_by
  ) VALUES (
    v_line.item_id,
    'in',
    p_qty,
    COALESCE(v_line.unit, 'pcs'),
    'return',
    'return:' || v_return_id,
    v_line.order_id,
    v_line.id,
    v_return_id,
    COALESCE(p_note, ''),
    COALESCE(auth.uid(), v_line.created_by)
  )
  RETURNING id INTO v_movement_id;

  PERFORM set_config('app.allow_order_status_update', '1', true);

  UPDATE public.orders
  SET status = 'retoure'
  WHERE id = v_line.order_id
    AND status <> 'retoure';

  RETURN v_movement_id;
END;
$$;

-- Backward compatible wrapper (old RPC name)
CREATE OR REPLACE FUNCTION public.create_return_movement(p_order_id uuid, p_order_line_id uuid, p_qty numeric, p_notes text DEFAULT NULL::text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN public.book_return(p_order_line_id, p_qty, p_notes);
END;
$$;

-- 10) Update return status view
DROP VIEW IF EXISTS public.order_line_return_status;
CREATE VIEW public.order_line_return_status AS
SELECT
  ol.id AS order_line_id,
  ol.order_id,
  ol.item_id,
  ol.qty AS ordered_qty,
  COALESCE(SUM(CASE WHEN sm.reason_code = 'sale' THEN sm.qty ELSE 0 END), 0) AS out_qty,
  COALESCE(SUM(CASE WHEN sm.reason_code = 'return' THEN sm.qty ELSE 0 END), 0) AS returned_qty,
  GREATEST(
    COALESCE(SUM(CASE WHEN sm.reason_code = 'sale' THEN sm.qty ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN sm.reason_code = 'return' THEN sm.qty ELSE 0 END), 0),
    0
  ) AS net_qty
FROM public.order_lines ol
LEFT JOIN public.stock_movements sm ON sm.order_line_id = ol.id
GROUP BY ol.id;

-- 11) Remove legacy triggers (avoid double booking)
DROP TRIGGER IF EXISTS trg_orders_done_apply_stock_once ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_cancelled_apply_stock_once ON public.orders;
DROP TRIGGER IF EXISTS trg_prevent_done_to_open ON public.orders;

commit;
