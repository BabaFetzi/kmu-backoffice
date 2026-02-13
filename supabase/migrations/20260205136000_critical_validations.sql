-- Critical validations (minimal, safe)

begin;

-- Items: enforce non-negative prices
ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_price_non_negative,
  ADD CONSTRAINT items_price_non_negative CHECK (COALESCE(price,0) >= 0);

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_purchase_price_non_negative,
  ADD CONSTRAINT items_purchase_price_non_negative CHECK (COALESCE(purchase_price,0) >= 0);

-- Order lines: qty > 0 (already exists in some schemas, keep safe)
ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_qty_check,
  ADD CONSTRAINT order_lines_qty_check CHECK (qty > 0);

-- Purchase order lines: qty > 0 (already exists in some schemas, keep safe)
ALTER TABLE public.purchase_order_lines
  DROP CONSTRAINT IF EXISTS purchase_order_lines_qty_check,
  ADD CONSTRAINT purchase_order_lines_qty_check CHECK (qty > 0);

-- Payments: amount > 0 (already exists, keep safe)
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_amount_check,
  ADD CONSTRAINT payments_amount_check CHECK (amount > 0);

commit;
