# Monitoring & Alerting Setup (Go-Live Minimum)

Stand: 2026-02-08  
Owner: _to be assigned_

## Ziel

P1/P2-Fehler und Dateninkonsistenzen frueh erkennen.

## Mindestsignale

1. API/Frontend Fehler
   - 5xx Fehlerquote > 2% in 5 min
   - Unhandled Promise Rejections im Browser
2. Datenqualitaet
   - `public.data_quality_issues_view` liefert > 0 Zeilen
   - Duplikate in `stock_movements` fuer `sale:` oder `cancel:`
3. Geschaeftsprozess
   - Rechnungen mit `payment_status_mismatch`
   - ueberfaellige Rechnungen ohne Mahnstufe nach Batch-Lauf

## Pruefqueries

```sql
-- Datenqualitaet offen
select * from public.data_quality_issues_view limit 50;

-- Duplikate bei idempotenten Bewegungen
select booking_key, count(*)
from public.stock_movements
where booking_key ~ '^(sale|cancel):'
group by booking_key
having count(*) > 1;
```

## Alert-Kanaele

- Primär: E-Mail an Ops-Verantwortliche
- Sekundär: Team-Chat Kanal `#erp-alerts`

## Testalarm (Pflicht vor Go-Live)

1. Einen kontrollierten Testalarm ausloesen.
2. Eingang in allen Kanaelen pruefen.
3. Acknowledge/Resolution dokumentieren.

## Ergebnisprotokoll

- Datum:
- Durchgefuehrt von:
- Kanaele getestet: `email/chat`
- Testalarm erfolgreich: `ja/nein`
- Reaktionszeit:
- Follow-up:
