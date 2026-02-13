-- Fix cancel-after-done for fixed documents (allow guarded update + credit note fields)

begin;

CREATE OR REPLACE FUNCTION public.cancel_order_after_done(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
  v_cn_date date;
  v_cn_no text;
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

  IF COALESCE(v_order.stock_applied, false) = false THEN
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
  PERFORM set_config('app.allow_document_update', '1', true);

  v_cn_date := COALESCE(v_order.credit_note_date, CURRENT_DATE);
  v_cn_no := COALESCE(v_order.credit_note_no, public.next_credit_note_no(v_cn_date));

  UPDATE public.orders
  SET status = 'storno',
      stock_reversed = true,
      document_type = 'credit_note',
      credit_note_date = v_cn_date,
      credit_note_no = v_cn_no
  WHERE id = p_order_id;

  PERFORM public.log_audit_event(
    'order.cancelled_after_done',
    'orders',
    p_order_id,
    jsonb_build_object('status', 'storno', 'credit_note_no', v_cn_no)
  );
END;
$$;

commit;
