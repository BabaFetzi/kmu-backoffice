-- Item import fields for Excel

begin;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS search_term text,
  ADD COLUMN IF NOT EXISTS technical_name text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS weight numeric(12,3),
  ADD COLUMN IF NOT EXISTS weight_unit text DEFAULT 'kg';

commit;
