-- Payments journal + apply_payment RPC

begin;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CHF',
  method text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_select_roles ON public.payments;
CREATE POLICY payments_select_roles ON public.payments
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS payments_insert_roles ON public.payments;
CREATE POLICY payments_insert_roles ON public.payments
FOR INSERT WITH CHECK (public.has_any_role(ARRAY['admin','buchhaltung']::public.app_role[]));

-- Apply payment and update order status
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Betrag muss > 0 sein.';
  END IF;

  INSERT INTO public.payments (order_id, amount, method, paid_at, note)
  VALUES (p_order_id, p_amount, p_method, COALESCE(p_paid_at, now()), p_note);

  SELECT gross_total INTO v_total FROM public.orders WHERE id = p_order_id;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Order nicht gefunden: %', p_order_id;
  END IF;

  SELECT COALESCE(SUM(amount),0)
    INTO v_paid
  FROM public.payments
  WHERE order_id = p_order_id;

  IF v_paid >= v_total THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        paid_at = COALESCE(p_paid_at, now())
    WHERE id = p_order_id;
  ELSE
    UPDATE public.orders
    SET payment_status = 'open'
    WHERE id = p_order_id;
  END IF;
END;
$$;

DROP VIEW IF EXISTS public.payment_export_view;
CREATE VIEW public.payment_export_view AS
SELECT
  p.id,
  p.order_id,
  o.invoice_no,
  o.order_no,
  p.amount,
  p.currency,
  p.method,
  p.paid_at,
  c.company_name AS customer_name
FROM public.payments p
JOIN public.orders o ON o.id = p.order_id
LEFT JOIN public.customers c ON c.id = o.customer_id;

commit;
