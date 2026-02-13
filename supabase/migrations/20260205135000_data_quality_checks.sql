-- Data quality checks (non-destructive)

begin;

DROP VIEW IF EXISTS public.data_quality_issues;
CREATE VIEW public.data_quality_issues AS
SELECT 'company_profile_missing' AS issue_type,
       NULL::uuid AS entity_id,
       'company_profile'::text AS entity,
       'Firmendaten fehlen oder sind unvollständig.' AS message
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_profile
  WHERE legal_name IS NOT NULL AND street IS NOT NULL AND zip IS NOT NULL AND city IS NOT NULL AND country IS NOT NULL
)

UNION ALL

SELECT 'customer_address_missing', c.id, 'customers',
       'Kundenadresse unvollständig (Firma, Strasse, PLZ, Ort, Land).'
FROM public.customers c
WHERE c.company_name IS NULL OR c.street IS NULL OR c.zip IS NULL OR c.city IS NULL OR c.country IS NULL

UNION ALL

SELECT 'item_price_missing', i.id, 'items',
       'Artikelpreis fehlt (Verkaufspreis oder Einkaufspreis).'
FROM public.items i
WHERE COALESCE(i.price, 0) = 0 OR COALESCE(i.purchase_price, 0) = 0

UNION ALL

SELECT 'invoice_incomplete', o.id, 'orders',
       'Beleg unvollständig (Rechnungsnummer/Datum/Total).'
FROM public.orders o
WHERE (o.invoice_no IS NOT NULL OR o.credit_note_no IS NOT NULL)
  AND (o.invoice_date IS NULL OR COALESCE(o.gross_total,0) <= 0)

UNION ALL

SELECT 'payment_status_mismatch', o.id, 'orders',
       'Zahlstatus widerspricht Zahlungen (OP/paid).'
FROM public.orders o
LEFT JOIN (
  SELECT order_id, COALESCE(SUM(amount),0) AS paid_total
  FROM public.payments
  GROUP BY order_id
) p ON p.order_id = o.id
WHERE o.document_type = 'invoice'
  AND (
    (o.payment_status = 'paid' AND COALESCE(p.paid_total,0) < COALESCE(o.gross_total,0)) OR
    (o.payment_status IN ('open','partial','overdue') AND COALESCE(p.paid_total,0) >= COALESCE(o.gross_total,0))
  );

commit;
