# UAT Test Matrix (Go-Live)

Stand: 2026-02-08  
Ziel: Reale End-to-End Abnahme vor Go-Live

## Nutzung

1. Testfall in der Reihenfolge ausführen.
2. Ergebnis in `Actual Result` eintragen.
3. Evidenz verlinken (Screenshot/PDF/CSV/SQL).
4. Auf `PASS` oder `FAIL` setzen.
5. Bei `FAIL` Ticket-ID hinterlegen.

## Status

`PASS` | `FAIL` | `BLOCKED` | `NOT_RUN`

## Matrix

| ID | Bereich | Priorität | Preconditions | Schritte | Erwartet | Actual Result | Evidenz | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|
| UAT-01 | Auftrag OPEN -> DONE | P1 | Kunde, Artikel, Bestand vorhanden; Stammdaten vollständig | Auftrag mit 2 Positionen anlegen und auf `Erledigt` setzen | Status `done`, genau eine `sale:*` Buchung pro Position, Rechnung + PDF erzeugbar | Für `AUF-000061`: `status=done`, `invoice_no=2026-INV-000010`, `sale_movements=2` | SQL-Result `Order sale movement summary` (2026-02-08) | Fabio | PASS |
| UAT-02 | Idempotenz DONE | P1 | UAT-01 Auftrag vorhanden | `Erledigt` erneut auslösen (Doppelklick/Retry) | Kein zweites `sale:*`, Fehlermeldung/Block korrekt | Duplicate-Check für `AUF-000061` liefert `0 rows` bei `HAVING count(*) > 1` | SQL-Result `UAT-02 duplicate sale-booking check` (2026-02-08) | Fabio | PASS |
| UAT-03 | Teilretoure | P1 | DONE Auftrag aus UAT-01 | Für 1 Position Teilretoure buchen (z.B. 1 von 3) | Status `retoure`, `return` Bewegung korrekt, Netto-Menge stimmt |  |  |  | NOT_RUN |
| UAT-04 | Storno nach DONE | P1 | DONE oder RETOURE Auftrag vorhanden | `Stornieren` ausführen | Gutschrift erzeugt, `cancel:*` Bewegung einmalig, Status `storno` |  |  |  | NOT_RUN |
| UAT-05 | Belegfixierung | P1 | Rechnung oder Gutschrift vorhanden | Auftrag/Position nachträglich ändern oder löschen versuchen | DB blockt Änderungen (`Beleg fixiert`) |  |  |  | NOT_RUN |
| UAT-06 | Zahlung Teil + Rest | P1 | Offene Rechnung vorhanden | Teilzahlung buchen, danach Restzahlung buchen | `payment_status` wechselt `open -> partial -> paid`, Zahlungsjournal korrekt |  |  |  | NOT_RUN |
| UAT-07 | Überfälligkeit + Mahnung | P1 | Rechnung mit Fälligkeitsdatum in der Vergangenheit, unbezahlt | `Überfällige prüfen` und `Auto-Mahnen` ausführen | `overdue` gesetzt, Mahnstufe erhöht, Mahnlog + Historie sichtbar |  |  |  | NOT_RUN |
| UAT-08 | Beleg-Historie | P2 | Auftrag mit Zahlung + Mahnung + Storno vorhanden | Historie öffnen | Chronologische Events (audit/payment/dunning) vollständig |  |  |  | NOT_RUN |
| UAT-09 | PDF Rechnung | P1 | DONE Auftrag mit Belegdaten | `PDF speichern` und `Rechnung drucken` | Layout sauber, keine Überlappung/Abschneidung, Summen korrekt |  |  |  | NOT_RUN |
| UAT-10 | PDF Gutschrift | P1 | Stornierter Auftrag mit Gutschrift | Gutschrift-PDF erzeugen | Gutschriftnummer, Beträge, Referenzen korrekt |  |  |  | NOT_RUN |
| UAT-11 | CSV Treuhänderexport | P1 | Zahlungen, offene Posten, Mahnlog vorhanden | `Treuhänder CSV` und weitere CSV-Buttons exportieren | Dateien vollständig, Werte konsistent mit UI |  |  |  | NOT_RUN |
| UAT-12 | Rollen/RLS | P1 | Testuser für `admin`, `buchhaltung`, `lager`, `read_only` | Mit Rollen einloggen und kritische Aktionen prüfen | Rechte greifen korrekt (lesen/schreiben entsprechend Rolle) |  |  |  | NOT_RUN |
| UAT-13 | Einkauf Wareneingang | P2 | Lieferant + Artikelzuordnung vorhanden | Einkauf anlegen, Position hinzufügen, Wareneingang buchen | Bestand steigt exakt, purchase-Bewegungen korrekt, keine Duplikate |  |  |  | NOT_RUN |
| UAT-14 | Stammdaten Pflichtprüfung | P2 | Neuer Mandanten- oder Kundendatensatz | Pflichtfelder absichtlich leer lassen | Speichern wird validiert/blockiert mit klarer Meldung |  |  |  | NOT_RUN |
| UAT-15 | UI Konsistenz und Performance | P2 | Testdaten mit mehreren Belegen | Listen/Filter/Status prüfen, Seitenwechsel und Suche messen | Keine UI-Überlappung, konsistente Chips/Buttons, Hauptseiten reagieren zügig |  |  |  | NOT_RUN |

## Abnahme-Regel

1. Alle P1-Fälle müssen `PASS` sein.
2. P2 darf max. 1 `BLOCKED` haben, kein `FAIL`.
3. Bei jedem `FAIL` muss ein Ticket mit Zieltermin existieren.
