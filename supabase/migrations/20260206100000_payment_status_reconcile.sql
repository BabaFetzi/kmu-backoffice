-- Reconcile payment status + robust apply_payment behavior

begin;

CREATE OR REPLACE FUNCTION public.recalculate_order_payment_status(
  p_order_id uuid,
  p_reference_paid_at timestamptz DEFAULT now()
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_gross_total numeric := 0;
  v_discount_amount numeric := 0;
  v_discount_until date;
  v_due_date date;
  v_document_type text;
  v_paid_sum numeric := 0;
  v_last_paid_at timestamptz;
  v_required_total numeric := 0;
  v_status text := 'open';
BEGIN
  SELECT
    COALESCE(o.gross_total, 0),
    COALESCE(o.discount_amount, 0),
    o.discount_until,
    o.due_date,
    o.document_type
  INTO
    v_gross_total,
    v_discount_amount,
    v_discount_until,
    v_due_date,
    v_document_type
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF v_document_type IS NULL THEN
    RAISE EXCEPTION 'Order nicht gefunden: %', p_order_id;
  END IF;

  SELECT COALESCE(SUM(p.amount), 0), MAX(p.paid_at)
    INTO v_paid_sum, v_last_paid_at
  FROM public.payments p
  WHERE p.order_id = p_order_id;

  v_required_total := v_gross_total;

  IF v_discount_until IS NOT NULL
     AND COALESCE(p_reference_paid_at, now())::date <= v_discount_until THEN
    v_required_total := GREATEST(v_gross_total - v_discount_amount, 0);
  END IF;

  IF v_document_type = 'credit_note' THEN
    -- Credit notes are handled operationally outside incoming payments.
    v_status := CASE WHEN v_paid_sum > 0 THEN 'partial' ELSE 'open' END;
  ELSIF v_paid_sum >= (v_required_total - 0.01) THEN
    v_status := 'paid';
  ELSIF v_paid_sum > 0 THEN
    v_status := 'partial';
  ELSIF v_due_date IS NOT NULL AND CURRENT_DATE > v_due_date THEN
    v_status := 'overdue';
  ELSE
    v_status := 'open';
  END IF;

  PERFORM set_config('app.allow_document_update', '1', true);

  UPDATE public.orders o
  SET
    payment_status = v_status,
    paid_at = CASE WHEN v_status = 'paid' THEN COALESCE(v_last_paid_at, p_reference_paid_at, now()) ELSE NULL END
  WHERE o.id = p_order_id;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Betrag muss > 0 sein.';
  END IF;

  INSERT INTO public.payments (order_id, amount, method, paid_at, note)
  VALUES (p_order_id, p_amount, p_method, COALESCE(p_paid_at, now()), p_note);

  PERFORM public.recalculate_order_payment_status(p_order_id, COALESCE(p_paid_at, now()));
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_all_payment_statuses()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT o.id
    FROM public.orders o
    WHERE COALESCE(o.document_archived, false) = false
  LOOP
    PERFORM public.recalculate_order_payment_status(r.id, now());
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- One-time reconciliation for existing data
SELECT public.reconcile_all_payment_statuses();

commit;
