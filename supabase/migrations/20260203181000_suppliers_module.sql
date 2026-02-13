-- Suppliers module (Lieferanten)

begin;

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid() NOT NULL,

  company_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  street text,
  street2 text,
  zip text,
  city text,
  country text DEFAULT 'CH',
  vat_uid text,

  notes text,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,

  CONSTRAINT suppliers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);

CREATE INDEX IF NOT EXISTS suppliers_status_idx ON public.suppliers(status);
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers(company_name);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_select_own ON public.suppliers;
CREATE POLICY suppliers_select_own ON public.suppliers
FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS suppliers_insert_own ON public.suppliers;
CREATE POLICY suppliers_insert_own ON public.suppliers
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS suppliers_update_own ON public.suppliers;
CREATE POLICY suppliers_update_own ON public.suppliers
FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS suppliers_delete_own ON public.suppliers;
CREATE POLICY suppliers_delete_own ON public.suppliers
FOR DELETE USING (created_by = auth.uid());

commit;
