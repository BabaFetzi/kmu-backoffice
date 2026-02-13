# Go-Live Checklist (KMU Backoffice ERP)

Stand: 2026-02-08 (aktualisiert)  
Status: `open` | `in_progress` | `done` | `blocked`

## 1) Release & Abnahme

| ID | Aufgabe | Nachweis | Abnahmekriterium | Status |
|---|---|---|---|---|
| REL-01 | Feature-Freeze für Core-Module setzen | Release-Note | Keine neuen Features bis Go-Live | open |
| REL-02 | Abnahme-Kriterien je Kernprozess fixieren | `/docs/acceptance-criteria.md` | Kriterien für alle Kernprozesse vorhanden | done |
| REL-04 | UAT-Matrix mit Realprozess-Durchlauf abschliessen | `/docs/testing/uat-test-matrix.md` | Alle P1-Testfälle `PASS` | in_progress |
| REL-05 | UAT-Defects strukturiert tracken | `/docs/testing/uat-defect-log.md` | Alle FAIL-Fälle mit Owner und Termin erfasst | in_progress |
| REL-03 | Go/No-Go Meeting einplanen und entscheiden | `/docs/release/go-no-go-protocol.md` | Alle Gates bewertet, Entscheidung protokolliert | in_progress |

## 2) Test-Härtung (Pflicht)

| ID | Aufgabe | Nachweis | Abnahmekriterium | Status |
|---|---|---|---|---|
| TST-01 | SQL-Kritiktests auf 30+ Fälle ausbauen | `/supabase/tests/*.sql` | 30+ Tests grün | in_progress |
| TST-02 | E2E Smoke-Tests Kernflows | `/docs/testing/e2e-smoke-test-report.md` | Auftrag->Rechnung->Zahlung->Mahnung->Gutschrift grün | done |
| TST-03 | Browser-Regression (Safari/Chrome/Edge) | `/docs/testing/browser-regression-protocol.md` | Keine P1/P2 Browserfehler | done |

## 3) Compliance CH/EU

| ID | Aufgabe | Nachweis | Abnahmekriterium | Status |
|---|---|---|---|---|
| COM-01 | MWST-Auswertung mit Treuhänder validieren | Freigabe | Keine fachlichen Blocker | open |
| COM-02 | Beleg-Unveränderbarkeit + Archivprozess dokumentieren | `/docs/compliance/belegprozess.md` | Prozess vollständig beschrieben | done |
| COM-03 | DSG/DSGVO-Minimalcheck dokumentieren | `/docs/compliance/privacy-check.md` | Alle Pflichtpunkte beantwortet | done |

## 4) Buchhaltung light

| ID | Aufgabe | Nachweis | Abnahmekriterium | Status |
|---|---|---|---|---|
| FIN-01 | Teilzahlung/Restzahlung/Überzahlung testen | Testprotokoll | `payment_status` in allen Fällen korrekt | done |
| FIN-02 | Skonto-Fälle validieren | Testdaten + Ergebnis | Früh/Spät-Zahlung korrekt | in_progress |
| FIN-03 | Debitoren/Kreditoren-Summen abgleichen | Abgleichsheet | Differenz = 0 oder begründet | in_progress |

## 5) Betrieb & Sicherheit

| ID | Aufgabe | Nachweis | Abnahmekriterium | Status |
|---|---|---|---|---|
| OPS-01 | Backup/Restore Test durchführen | `/docs/operations/backup-restore-test.md` | Restore in Testumgebung erfolgreich | in_progress |
| OPS-02 | Monitoring + Alerting aktivieren | `/docs/operations/monitoring-alerting.md` | Testalarm funktioniert | in_progress |
| OPS-03 | Rollback-Plan erstellen | `/docs/release/rollback-plan.md` | Plan vollständig und getestet | done |
| OPS-04 | Admin-Rolle Recovery Runbook | `/docs/operations/admin-role-recovery.md` | Eigene Admin-Rolle kann in <2 min wiederhergestellt werden | done |

## 6) UX & Performance

| ID | Aufgabe | Nachweis | Abnahmekriterium | Status |
|---|---|---|---|---|
| UX-01 | Tabellen/Filter konsistent machen | UI-Abnahme | Einheitliches Verhalten in allen Listen | in_progress |
| UX-02 | Status-Indikatoren vereinheitlichen | Screenshotset | Farben/Labels überall konsistent | in_progress |
| UX-03 | Performance-Baseline messen | Messprotokoll | Hauptseiten <2s lokal/staging | open |

## Mindest-Gate für Go-Live

1. Keine offenen P1/P2 Bugs.
2. SQL + E2E Testpaket grün.
3. MWST- und Treuhandexport fachlich freigegeben.
4. Backup/Restore erfolgreich getestet.
5. Rollen-/RLS-Check abgeschlossen.
