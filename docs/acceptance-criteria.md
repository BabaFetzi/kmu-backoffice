# Acceptance Criteria (Core Flows)

## 1) Auftrag -> Erledigt

1. Auftrag mit Positionen (`qty > 0`) kann von `open` auf `done` abgeschlossen werden.
2. Pro Position wird genau eine `sale`-Bewegung gebucht.
3. Bestand wird nicht negativ.
4. Rechnung (`invoice_no`) und Fälligkeit (`due_date`) werden gesetzt.

## 2) Retoure

1. Retoure nur auf bereits ausgelieferte Menge.
2. Retoure erzeugt `return`-Bewegung.
3. Auftragsstatus geht auf `retoure`, falls zutreffend.
4. Netto-/Retouren-Mengen stimmen in Detailansicht und Historie.

## 3) Storno nach Erledigt

1. Storno auf `done/retoure` erzeugt Gegenbuchung (`cancel`).
2. Belegtyp wird `credit_note`.
3. `credit_note_no` wird gesetzt.
4. Keine doppelte Stornobuchung bei Wiederholung.

## 4) Zahlung

1. Teilzahlung setzt `payment_status = partial`.
2. Vollzahlung setzt `payment_status = paid`.
3. Überzahlung bricht nicht und markiert `paid`.
4. Zahlungsjournal enthält jeden Zahlungsvorgang vollständig.

## 5) Mahnwesen

1. Überfällige offene Rechnungen werden in Aging korrekt geführt.
2. Manueller und Batch-Mahnlauf erhöhen Mahnstufe bis Max-Level.
3. Mahnhistorie ist pro Beleg nachvollziehbar.

## 6) Belegschutz

1. Fixierte Belege dürfen nicht frei geändert oder gelöscht werden.
2. Erlaubte Workflow-RPCs bleiben funktionsfähig.
3. Archivierte Belege sind aus Standardlisten ausgeblendet (wo vorgesehen).
