-- Enforce invoice requirements (company profile + customer address) on finalize

begin;

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
END;
$$;

commit;
