-- Link items to suppliers

begin;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_supplier_fk,
  ADD CONSTRAINT items_supplier_fk
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_supplier_id ON public.items(supplier_id);

commit;
