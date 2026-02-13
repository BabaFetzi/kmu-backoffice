-- Audit log + workflow guards for purchases + extended RPC logging

begin;

-- 1) Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_created_by_idx ON public.audit_log(created_by);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_select_own ON public.audit_log;
CREATE POLICY audit_log_select_own ON public.audit_log
FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS audit_log_insert_own ON public.audit_log;
CREATE POLICY audit_log_insert_own ON public.audit_log
FOR INSERT WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- 2) Audit helper
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_data jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.audit_log (action, entity, entity_id, data, created_by)
  VALUES (p_action, p_entity, p_entity_id, COALESCE(p_data, '{}'::jsonb), auth.uid());
END;
$$;

-- 3) Stock movements audit (after insert)
CREATE OR REPLACE FUNCTION public.audit_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.log_audit_event(
    'stock_movement.insert',
    'stock_movements',
    NEW.id,
    jsonb_build_object(
      'reason_code', NEW.reason_code,
      'movement_type', NEW.movement_type,
      'qty', NEW.qty,
      'qty_change', NEW.qty_change,
      'booking_key', NEW.booking_key,
      'order_id', NEW.order_id,
      'order_line_id', NEW.order_line_id,
      'order_return_id', NEW.order_return_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_audit_stock_movements
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.audit_stock_movement();

-- 4) Purchase status guard (server-side only)
CREATE OR REPLACE FUNCTION public.guard_purchase_status_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF old.status IS DISTINCT FROM new.status THEN
    IF current_setting('app.allow_purchase_status_update', true) <> '1' THEN
      RAISE EXCEPTION 'Purchase-Status darf nur via RPC geändert werden.';
    END IF;

    IF NOT (
      (old.status = 'open' AND new.status IN ('ordered','received','cancelled')) OR
      (old.status = 'ordered' AND new.status IN ('received','cancelled'))
    ) THEN
      RAISE EXCEPTION 'Unerlaubter Statuswechsel: % -> %', old.status, new.status;
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_status_guard ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_status_guard
BEFORE UPDATE OF status ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_purchase_status_update();

-- 5) Purchase lines guard: only editable while OPEN
CREATE OR REPLACE FUNCTION public.guard_purchase_order_lines_edit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := old.purchase_order_id;
  ELSE
    v_order_id := new.purchase_order_id;
  END IF;

  SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_order_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found: %', v_order_id;
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Positionen sind nur bei OPEN editierbar (aktuell: %).', v_status;
  END IF;

  RETURN COALESCE(new, old);
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_order_lines_guard ON public.purchase_order_lines;
CREATE TRIGGER trg_purchase_order_lines_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION public.guard_purchase_order_lines_edit();

-- 6) Purchase RPCs with audit + server-side flag
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

  PERFORM set_config('app.allow_purchase_status_update', '1', true);

  UPDATE public.purchase_orders
  SET status = 'received',
      received_at = now()
  WHERE id = p_order_id;

  PERFORM public.log_audit_event(
    'purchase.received',
    'purchase_orders',
    p_order_id,
    jsonb_build_object('status', 'received')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_order_id uuid) RETURNS void
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
    RAISE EXCEPTION 'Storno nur bei OPEN/ORDERED erlaubt (aktuell: %).', v_order.status;
  END IF;

  PERFORM set_config('app.allow_purchase_status_update', '1', true);

  UPDATE public.purchase_orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  PERFORM public.log_audit_event(
    'purchase.cancelled',
    'purchase_orders',
    p_order_id,
    jsonb_build_object('status', 'cancelled')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_purchase_sent(p_order_id uuid, p_sent_to text) RETURNS void
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
    RAISE EXCEPTION 'Nur OPEN darf auf ORDERED gesetzt werden (aktuell: %).', v_order.status;
  END IF;

  IF p_sent_to IS NULL OR length(trim(p_sent_to)) = 0 THEN
    RAISE EXCEPTION 'sent_to ist Pflicht.';
  END IF;

  PERFORM set_config('app.allow_purchase_status_update', '1', true);

  UPDATE public.purchase_orders
  SET status = 'ordered',
      sent_at = now(),
      sent_to = trim(p_sent_to),
      sent_by = auth.uid()
  WHERE id = p_order_id;

  PERFORM public.log_audit_event(
    'purchase.ordered',
    'purchase_orders',
    p_order_id,
    jsonb_build_object('status', 'ordered', 'sent_to', trim(p_sent_to))
  );
END;
$$;

-- 7) Order RPC audit logging
CREATE OR REPLACE FUNCTION public.finalize_order(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
  v_company record;
  v_customer record;
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

  -- Company profile required for invoice
  SELECT * INTO v_company
  FROM public.company_profile
  WHERE created_by = auth.uid()
  LIMIT 1;

  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'Stammdaten fehlen: Bitte Firmendaten erfassen (Stammdaten).';
  END IF;

  IF v_company.legal_name IS NULL OR v_company.street IS NULL OR v_company.zip IS NULL OR v_company.city IS NULL OR v_company.country IS NULL THEN
    RAISE EXCEPTION 'Stammdaten unvollständig: Name/Adresse/Land sind Pflicht.';
  END IF;

  -- Customer required for invoice
  IF v_order.customer_id IS NULL THEN
    RAISE EXCEPTION 'Bitte Kunde wählen (Rechnung benötigt Empfänger).';
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE id = v_order.customer_id;

  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'Kunde nicht gefunden.';
  END IF;

  IF v_customer.company_name IS NULL OR v_customer.street IS NULL OR v_customer.zip IS NULL OR v_customer.city IS NULL OR v_customer.country IS NULL THEN
    RAISE EXCEPTION 'Kundenadresse unvollständig (Firma, Strasse, PLZ, Ort, Land).';
  END IF;

  -- Bestand prüfen
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

  -- ensure totals
  PERFORM public.recalc_order_totals(p_order_id);

  PERFORM set_config('app.allow_order_status_update', '1', true);

  UPDATE public.orders
  SET status = 'done',
      stock_applied = true,
      invoice_date = COALESCE(invoice_date, CURRENT_DATE),
      invoice_no = COALESCE(invoice_no, public.generate_invoice_no()),
      supply_date = COALESCE(supply_date, order_date, CURRENT_DATE)
  WHERE id = p_order_id;

  PERFORM public.log_audit_event(
    'order.finalized',
    'orders',
    p_order_id,
    jsonb_build_object('status', 'done', 'invoice_no', v_order.invoice_no)
  );
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

  PERFORM public.log_audit_event(
    'order.cancelled',
    'orders',
    p_order_id,
    jsonb_build_object('status', 'storno')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.book_return(p_order_line_id uuid, p_qty numeric, p_note text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line record;
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

  PERFORM public.log_audit_event(
    'order.return',
    'orders',
    v_line.order_id,
    jsonb_build_object('order_line_id', v_line.id, 'qty', p_qty)
  );

  RETURN v_movement_id;
END;
$$;

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

  PERFORM public.log_audit_event(
    'order.cancelled_after_done',
    'orders',
    p_order_id,
    jsonb_build_object('status', 'storno')
  );
END;
$$;

commit;
