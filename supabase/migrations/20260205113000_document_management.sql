-- Document management: payment status + paid tracking

begin;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'open' NOT NULL,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check,
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status = ANY (ARRAY['open','paid','overdue']));

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_due_date ON public.orders(due_date);

commit;
