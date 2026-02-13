# Belegprozess und Unveränderbarkeit

## Ziel

Sicherstellen, dass ausgestellte Rechnungen/Gutschriften nachvollziehbar und nach Ausgabe nicht frei manipulierbar sind.

## Technische Umsetzung (aktuell)

1. Belegnummern über DB-Funktionen (`next_invoice_no`, `next_credit_note_no`).
2. Belegschutz über Trigger:
   - `guard_document_update`
   - `guard_document_delete`
   - `guard_document_line_update`
3. Workflow-Änderungen nur über freigegebene RPCs.
4. Belegereignisse über Audit-/History-Views nachvollziehbar.

## Prozessregeln

1. `open` Aufträge dürfen bearbeitet werden.
2. Nach Belegerstellung (`invoice_no`/`credit_note_no`) gilt Dokument als fixiert.
3. Korrekturen erfolgen über Retoure/Gutschrift, nicht über Direktänderung.
4. Archivierung erfolgt nachvollziehbar, Beleg bleibt referenzierbar.

## Nachweise für Freigabe

1. SQL-Tests für Belegschutz grün.
2. UI-Test: direkte Änderung fixierter Belege wird blockiert.
3. Workflow-Test: erlaubte RPCs funktionieren trotz Schutz.
