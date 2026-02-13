-- Document archive flags

begin;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS document_archived boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS document_archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_document_archived ON public.orders(document_archived);

commit;
