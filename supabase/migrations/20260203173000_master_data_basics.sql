-- Master data: company profile + customer address/VAT UID

begin;

-- 1) Company profile (single row)
CREATE TABLE IF NOT EXISTS public.company_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),

  legal_name text NOT NULL,
  trading_name text,
  street text NOT NULL,
  street2 text,
  zip text NOT NULL,
  city text NOT NULL,
  country text NOT NULL DEFAULT 'CH',

  vat_uid text,
  iban text,
  bank_name text,
  email text,
  phone text
);

-- only one row allowed
CREATE UNIQUE INDEX IF NOT EXISTS ux_company_profile_singleton ON public.company_profile ((1));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_profile_updated_at ON public.company_profile;
CREATE TRIGGER trg_company_profile_updated_at
BEFORE UPDATE ON public.company_profile
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_profile_select_own ON public.company_profile;
CREATE POLICY company_profile_select_own ON public.company_profile
FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS company_profile_insert_own ON public.company_profile;
CREATE POLICY company_profile_insert_own ON public.company_profile
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS company_profile_update_own ON public.company_profile;
CREATE POLICY company_profile_update_own ON public.company_profile
FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- 2) Customer address + VAT UID
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS street2 text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'CH',
  ADD COLUMN IF NOT EXISTS vat_uid text;

commit;
