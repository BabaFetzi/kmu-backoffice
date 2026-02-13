-- Payment discount (Skonto) + partial payment status

begin;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS discount_until date,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0 NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check,
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status = ANY (ARRAY['open','partial','paid','overdue']));

CREATE OR REPLACE FUNCTION public.apply_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total numeric;
  v_paid numeric;
  v_discount numeric;
  v_due numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Betrag muss > 0 sein.';
  END IF;

  INSERT INTO public.payments (order_id, amount, method, paid_at, note)
  VALUES (p_order_id, p_amount, p_method, COALESCE(p_paid_at, now()), p_note);

  SELECT gross_total, discount_amount, discount_until
    INTO v_total, v_discount, v_due
  FROM public.orders
  WHERE id = p_order_id;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Order nicht gefunden: %', p_order_id;
  END IF;

  SELECT COALESCE(SUM(amount),0)
    INTO v_paid
  FROM public.payments
  WHERE order_id = p_order_id;

  IF v_due IS NOT NULL AND COALESCE(p_paid_at, now())::date <= v_due THEN
    v_total := v_total - COALESCE(v_discount, 0);
  END IF;

  IF v_paid >= v_total THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        paid_at = COALESCE(p_paid_at, now())
    WHERE id = p_order_id;
  ELSIF v_paid > 0 THEN
    UPDATE public.orders
    SET payment_status = 'partial'
    WHERE id = p_order_id;
  ELSE
    UPDATE public.orders
    SET payment_status = 'open'
    WHERE id = p_order_id;
  END IF;
END;
$$;

commit;
