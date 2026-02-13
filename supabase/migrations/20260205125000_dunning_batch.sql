-- Dunning automation batch + log

begin;

CREATE TABLE IF NOT EXISTS public.dunning_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  level int NOT NULL,
  note text
);

CREATE INDEX IF NOT EXISTS idx_dunning_log_order ON public.dunning_log(order_id);
CREATE INDEX IF NOT EXISTS idx_dunning_log_created ON public.dunning_log(created_at);

ALTER TABLE public.dunning_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dunning_log_select_roles ON public.dunning_log;
CREATE POLICY dunning_log_select_roles ON public.dunning_log
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS dunning_log_insert_roles ON public.dunning_log;
CREATE POLICY dunning_log_insert_roles ON public.dunning_log
FOR INSERT WITH CHECK (public.has_any_role(ARRAY['admin','buchhaltung']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.run_dunning_batch(p_max_level int DEFAULT 3) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.orders o
    SET dunning_level = LEAST(p_max_level, COALESCE(o.dunning_level, 0) + 1),
        dunning_last_at = now()
    WHERE o.document_type = 'invoice'
      AND o.payment_status = 'overdue'
      AND COALESCE(o.document_archived, false) = false
      AND (o.dunning_level IS NULL OR o.dunning_level < p_max_level)
    RETURNING o.id, o.dunning_level
  )
  INSERT INTO public.dunning_log (order_id, level, note)
  SELECT id, dunning_level, 'Batch-Automa' FROM upd;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

commit;
