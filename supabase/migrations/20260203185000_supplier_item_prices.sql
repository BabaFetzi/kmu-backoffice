-- Supplier-specific purchase prices

begin;

CREATE TABLE IF NOT EXISTS public.supplier_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),

  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  supplier_item_no text,
  purchase_price numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'CHF',
  lead_time_days int,
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_supplier_items_pair ON public.supplier_items(supplier_id, item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier ON public.supplier_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_item ON public.supplier_items(item_id);

-- RLS
ALTER TABLE public.supplier_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_items_select_own ON public.supplier_items;
CREATE POLICY supplier_items_select_own ON public.supplier_items
FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS supplier_items_insert_own ON public.supplier_items;
CREATE POLICY supplier_items_insert_own ON public.supplier_items
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS supplier_items_update_own ON public.supplier_items;
CREATE POLICY supplier_items_update_own ON public.supplier_items
FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS supplier_items_delete_own ON public.supplier_items;
CREATE POLICY supplier_items_delete_own ON public.supplier_items
FOR DELETE USING (created_by = auth.uid());

commit;
