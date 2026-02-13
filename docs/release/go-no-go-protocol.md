# Go/No-Go Protocol (KMU Backoffice)

Stand: 2026-02-08

## Teilnehmer

1. Produktverantwortung
2. Technikverantwortung
3. Fachbereich Buchhaltung
4. Fachbereich Operations

## Eingabedokumente

1. `/Users/fabiozahrl/Projects/kmu-backoffice/docs/go-live-checklist.md`
2. `/Users/fabiozahrl/Projects/kmu-backoffice/docs/testing/uat-test-matrix.md`
3. `/Users/fabiozahrl/Projects/kmu-backoffice/docs/testing/uat-defect-log.md`
4. `/Users/fabiozahrl/Projects/kmu-backoffice/docs/testing/e2e-smoke-test-report.md`
5. `/Users/fabiozahrl/Projects/kmu-backoffice/docs/operations/backup-restore-test.md`

## Gate-Fragen (alle Pflicht)

| Gate | Frage | Entscheid |
|---|---|---|
| G1 | Alle P1-UAT-Fälle `PASS`? | `yes/no` |
| G2 | Kein offener P1-Defect? | `yes/no` |
| G3 | SQL- und Smoke-Tests ohne kritische Fehler? | `yes/no` |
| G4 | Backup/Restore-Test erfolgreich? | `yes/no` |
| G5 | Rollen/RLS geprüft und freigegeben? | `yes/no` |
| G6 | MWST-/Treuhandexport fachlich freigegeben? | `yes/no` |

## Entscheidungsregel

1. `GO` nur wenn alle Gates `yes`.
2. `NO-GO` wenn mindestens ein Gate `no`.
3. Bei `NO-GO`: Defect-ID, Owner und Fix-Termin zwingend festhalten.

## Entscheidungsprotokoll

| Datum | Version/Tag | Ergebnis | Blocker | Nächster Termin |
|---|---|---|---|---|
|  |  | `GO/NO-GO` |  |  |

## Maßnahmen nach `GO`

1. Release-Freeze bestätigen.
2. Deploy nach Runbook ausführen.
3. Post-Deploy Smoke-Test durchführen.
4. Monitoring 24h aktiv begleiten.
