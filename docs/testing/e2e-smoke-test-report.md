# E2E Smoke Test Report

Stand: 2026-02-08
Scope: Auftrag -> Rechnung -> Zahlung -> Mahnung -> Gutschrift
Umgebung: Lokal (`npm run dev`) + Supabase Projekt `production`

## Testdaten
- User mit Rolle `admin`
- Mindestens 1 Kunde mit vollständiger Adresse
- Mindestens 1 Artikel mit Bestand > 0 und Preisen
- Firmendaten (`company_profile`) vollständig

## Testfälle

| ID | Flow | Schritte | Erwartung | Ergebnis |
|---|---|---|---|---|
| E2E-01 | Auftrag offen -> erledigt | Auftrag erstellen, Position hinzufügen, `Erledigt` | `invoice_no` gesetzt, `stock_movements sale:*` genau 1x/Line | PASS |
| E2E-02 | Erneut erledigen blockiert | Bei `done` nochmal `Erledigt` | Fehler `Order muss OPEN sein` | PASS |
| E2E-03 | Teilzahlung | Zahlung mit kleinerem Betrag buchen | `payment_status = partial` | PASS |
| E2E-04 | Vollzahlung | Restzahlung buchen | `payment_status = paid`, `paid_at` gesetzt | PASS |
| E2E-05 | Mahnstufe manuell | Mahnstufe erhöhen | `dunning_level` steigt, `dunning_log` Eintrag | PASS |
| E2E-06 | Auto-Mahnung | `Auto-Mahnen` ausführen | nur `overdue` Belege betroffen | PASS |
| E2E-07 | Done -> Storno/Gutschrift | `Stornieren` bei `done` | `credit_note_no` gesetzt, `cancel:*` genau 1x/Line | PASS |
| E2E-08 | Belegfixierung | Fixierten Auftrag bearbeiten | DB blockiert Update/Delete | PASS |
| E2E-09 | Dokumentexport | Rechnung/Gutschrift PDF + CSV | Download möglich, Inhalte plausibel | PASS |
| E2E-10 | Historie | Beleg-Historie öffnen | Zahlung/Mahnung/Audit sichtbar | PASS |

## SQL Nachweise
- `supabase/tests/critical_cases.sql` -> ohne ERROR
- `supabase/tests/go_live_acceptance.sql` -> ohne ERROR

## Ergebnis
- Kernprozess Ende-zu-Ende ist technisch lauffähig.
- Offene Punkte für Go-Live sind organisatorisch/fachlich (Treuhand-Freigabe, Backup/Restore, Monitoring).
