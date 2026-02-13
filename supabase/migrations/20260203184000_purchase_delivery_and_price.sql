-- Purchase delivery date + item purchase price

begin;

-- 1) Items: purchase price (default for purchasing)
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS purchase_price numeric(12,2);

-- 2) Purchase orders: required delivery date
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_date date;

UPDATE public.purchase_orders
SET delivery_date = COALESCE(delivery_date, order_date, CURRENT_DATE)
WHERE delivery_date IS NULL;

ALTER TABLE public.purchase_orders
  ALTER COLUMN delivery_date SET NOT NULL;

commit;
