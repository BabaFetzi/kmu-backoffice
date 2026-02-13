# DSG/DSGVO Minimalcheck

## 1) Rollen und Zugriff

1. RLS aktiv auf sensiblen Tabellen.
2. Rollen (`admin`, `buchhaltung`, `einkauf`, `lager`, `read_only`) mit Least-Privilege prüfen.
3. Test je Rolle: nur erlaubte Daten sichtbar/änderbar.

## 2) Datenexport (Auskunft)

1. Kunden-/Belegdaten exportierbar (CSV-Views vorhanden).
2. Export enthält keine unnötigen internen Felder.
3. Exportprozess dokumentiert (wer, wann, wozu).

## 3) Lösch- und Aufbewahrungslogik

1. Operative Löschung mit Belegschutz vereinbar definieren.
2. Archiv statt Hard-Delete für abrechnungsrelevante Daten.
3. Verfahren für Testdaten-Löschung dokumentiert.

## 4) Logging und Nachvollziehbarkeit

1. Audit-Einträge für Kernaktionen vorhanden.
2. Änderungen an Belegen/Zahlungen nachvollziehbar.
3. Zugriff auf Auditdaten rollenbasiert beschränkt.

## 5) Offene Punkte (zu klären)

1. Formale Rechtsprüfung CH/EU durch Fachstelle/Treuhänder.
2. Aufbewahrungsfristen final schriftlich festhalten.
3. Prozess für Betroffenenanfragen (Auskunft/Löschung) intern festlegen.
