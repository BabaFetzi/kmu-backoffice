-- Dunning letter templates

begin;

CREATE TABLE IF NOT EXISTS public.dunning_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  level int NOT NULL,
  title text NOT NULL,
  body text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dunning_templates_level ON public.dunning_templates(level);

ALTER TABLE public.dunning_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dunning_templates_select_roles ON public.dunning_templates;
CREATE POLICY dunning_templates_select_roles ON public.dunning_templates
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS dunning_templates_admin_write ON public.dunning_templates;
CREATE POLICY dunning_templates_admin_write ON public.dunning_templates
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY dunning_templates_admin_update ON public.dunning_templates
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY dunning_templates_admin_delete ON public.dunning_templates
FOR DELETE USING (public.has_role('admin'));

-- Seed defaults (if missing)
INSERT INTO public.dunning_templates (created_by, level, title, body)
VALUES
  (COALESCE(auth.uid(), gen_random_uuid()), 1, 'Zahlungserinnerung', 'Freundliche Erinnerung: Bitte begleichen Sie die offene Rechnung bis spätestens {{due_date}}.'),
  (COALESCE(auth.uid(), gen_random_uuid()), 2, '1. Mahnung', 'Leider ist die Rechnung noch offen. Wir bitten um Zahlung innerhalb von 10 Tagen.'),
  (COALESCE(auth.uid(), gen_random_uuid()), 3, '2. Mahnung', 'Die Rechnung ist weiterhin offen. Bitte begleichen Sie den Betrag umgehend.' )
ON CONFLICT (level) DO NOTHING;

commit;
