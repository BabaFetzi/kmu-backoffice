-- Document history view (payments + dunning + audit)

begin;

DROP VIEW IF EXISTS public.document_history_view;
CREATE VIEW public.document_history_view AS
SELECT
  p.order_id,
  p.paid_at AS event_at,
  'payment'::text AS event_type,
  jsonb_build_object(
    'amount', p.amount,
    'currency', p.currency,
    'method', p.method,
    'note', p.note
  ) AS detail
FROM public.payments p

UNION ALL

SELECT
  d.order_id,
  d.created_at AS event_at,
  'dunning'::text AS event_type,
  jsonb_build_object(
    'level', d.level,
    'note', d.note
  ) AS detail
FROM public.dunning_log d

UNION ALL

SELECT
  a.entity_id AS order_id,
  a.created_at AS event_at,
  a.action AS event_type,
  a.data AS detail
FROM public.audit_log a
WHERE a.entity = 'orders';

commit;
