-- Fix company_profile ownership + RLS for first-time setup

begin;

-- drop singleton index (blocks per-user rows)
DROP INDEX IF EXISTS ux_company_profile_singleton;

-- ensure one profile per user
CREATE UNIQUE INDEX IF NOT EXISTS ux_company_profile_owner ON public.company_profile(created_by);

-- set owner if missing
CREATE OR REPLACE FUNCTION public.set_company_profile_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF new.created_by IS NULL THEN
    new.created_by := auth.uid();
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_profile_owner ON public.company_profile;
CREATE TRIGGER trg_company_profile_owner
BEFORE INSERT OR UPDATE ON public.company_profile
FOR EACH ROW
EXECUTE FUNCTION public.set_company_profile_owner();

-- RLS allow claim when created_by is null (single-tenant onboarding)
DROP POLICY IF EXISTS company_profile_select_own ON public.company_profile;
CREATE POLICY company_profile_select_own ON public.company_profile
FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);

DROP POLICY IF EXISTS company_profile_insert_own ON public.company_profile;
CREATE POLICY company_profile_insert_own ON public.company_profile
FOR INSERT WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

DROP POLICY IF EXISTS company_profile_update_own ON public.company_profile;
CREATE POLICY company_profile_update_own ON public.company_profile
FOR UPDATE USING (created_by = auth.uid() OR created_by IS NULL)
WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

commit;
