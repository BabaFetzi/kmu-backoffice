-- Allow return status transition on fixed documents

begin;

CREATE OR REPLACE FUNCTION public.book_return(
  p_order_line_id uuid,
  p_qty numeric,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  PERFORM set_config('app.allow_document_update', '1', true);

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

commit;
