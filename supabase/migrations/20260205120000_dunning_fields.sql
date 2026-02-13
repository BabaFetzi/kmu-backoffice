-- Dunning (Mahnstufen) fields

begin;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dunning_level int DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS dunning_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_note text;

CREATE INDEX IF NOT EXISTS idx_orders_dunning_level ON public.orders(dunning_level);

commit;
