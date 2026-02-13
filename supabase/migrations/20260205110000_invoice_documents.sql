-- Invoice documents: yearly numbering + payment terms + credit notes

begin;

-- 1) Orders: document fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_year int,
  ADD COLUMN IF NOT EXISTS payment_terms_days int DEFAULT 30 NOT NULL,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'invoice' NOT NULL,
  ADD COLUMN IF NOT EXISTS credit_note_no text,
  ADD COLUMN IF NOT EXISTS credit_note_date date;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_document_type_check,
  ADD CONSTRAINT orders_document_type_check
  CHECK (document_type = ANY (ARRAY['invoice','credit_note']));

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_credit_note_no ON public.orders(credit_note_no);

-- 2) Invoice counters by year
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year int PRIMARY KEY,
  seq int NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_invoice_no(p_date date DEFAULT CURRENT_DATE) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM p_date);
  v_seq int;
BEGIN
  INSERT INTO public.invoice_counters (year, seq)
  VALUES (v_year, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.invoice_counters
  SET seq = seq + 1
  WHERE year = v_year
  RETURNING seq INTO v_seq;

  RETURN v_year::text || '-INV-' || lpad(v_seq::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_credit_note_no(p_date date DEFAULT CURRENT_DATE) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM p_date);
  v_seq int;
BEGIN
  INSERT INTO public.invoice_counters (year, seq)
  VALUES (v_year, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.invoice_counters
  SET seq = seq + 1
  WHERE year = v_year
  RETURNING seq INTO v_seq;

  RETURN v_year::text || '-CRN-' || lpad(v_seq::text, 6, '0');
END;
$$;

-- 3) Finalize order (invoice)
CREATE OR REPLACE FUNCTION public.finalize_order(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
  v_company record;
  v_customer record;
  r record;
  v_inv_date date;
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

  v_inv_date := COALESCE(v_order.invoice_date, CURRENT_DATE);

  UPDATE public.orders
  SET status = 'done',
      stock_applied = true,
      invoice_date = v_inv_date,
      invoice_year = EXTRACT(YEAR FROM v_inv_date)::int,
      invoice_no = COALESCE(invoice_no, public.next_invoice_no(v_inv_date)),
      supply_date = COALESCE(supply_date, order_date, CURRENT_DATE),
      due_date = COALESCE(due_date, v_inv_date + (COALESCE(payment_terms_days, 30) * INTERVAL '1 day'))
  WHERE id = p_order_id;

  PERFORM public.log_audit_event(
    'order.finalized',
    'orders',
    p_order_id,
    jsonb_build_object('status', 'done')
  );
END;
$$;

-- 4) Cancel-after-done -> credit note
CREATE OR REPLACE FUNCTION public.cancel_order_after_done(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
  v_cn_date date;
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

  v_cn_date := COALESCE(v_order.credit_note_date, CURRENT_DATE);

  UPDATE public.orders
  SET status = 'storno',
      stock_reversed = true,
      document_type = 'credit_note',
      credit_note_date = v_cn_date,
      credit_note_no = COALESCE(credit_note_no, public.next_credit_note_no(v_cn_date))
  WHERE id = p_order_id;

  PERFORM public.log_audit_event(
    'order.cancelled_after_done',
    'orders',
    p_order_id,
    jsonb_build_object('status', 'storno', 'credit_note_no', v_order.credit_note_no)
  );
END;
$$;

commit;
