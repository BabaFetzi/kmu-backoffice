# Backup/Restore Test Protocol

Stand: 2026-02-08  
Owner: _to be assigned_

## Ziel

Nachweisen, dass ein Restore der produktionsrelevanten Daten in einer Testumgebung reproduzierbar funktioniert.

## Umfang

- Supabase Postgres Daten (Schema + Daten)
- Supabase Storage Bucket `documents`
- Kritische Tabellen:
  - `orders`, `order_lines`, `stock_movements`
  - `payments`, `dunning_log`
  - `customers`, `items`, `suppliers`

## Testablauf

1. Backup erstellen
   - DB Export aus Produktion (Schema + Daten)
   - Storage Export (Dokumente)
2. Restore in Testumgebung
   - Leere Test-DB bereitstellen
   - Export einspielen
   - Storage-Dateien einspielen
3. Validierung
   - SQL: `supabase/tests/go_live_acceptance.sql`
   - UI-Checks:
     - Belege sichtbar
     - PDF-Dateien downloadbar
     - Zahlungen/Mahnstufen plausibel

## Ergebnisprotokoll

- Datum:
- Durchgefuehrt von:
- Dauer (min):
- Restore erfolgreich: `ja/nein`
- Auffaelligkeiten:
- Ticket/Follow-up:

## Abnahme

Abnahme gilt als erfuellt, wenn:

- kein SQL-Fehler beim Restore auftritt,
- Go-Live Acceptance Checks ohne ERROR laufen,
- mindestens 3 historische Belege inklusive Datei abrufbar sind.
