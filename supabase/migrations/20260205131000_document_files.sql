-- Document files registry

begin;

CREATE TABLE IF NOT EXISTS public.document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  note text
);

CREATE INDEX IF NOT EXISTS idx_document_files_order ON public.document_files(order_id);

ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_files_select_roles ON public.document_files;
CREATE POLICY document_files_select_roles ON public.document_files
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS document_files_insert_roles ON public.document_files;
CREATE POLICY document_files_insert_roles ON public.document_files
FOR INSERT WITH CHECK (public.has_any_role(ARRAY['admin','buchhaltung']::public.app_role[]));

commit;
