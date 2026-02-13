# UAT Defect Log (Go-Live)

Stand: 2026-02-08  
Zweck: Einheitliches Tracking aller UAT-Abweichungen bis zur Freigabe.

## Regeln

1. Jeder `FAIL` aus der UAT-Matrix erzeugt genau einen Eintrag.
2. P1-Defects blockieren Go-Live immer.
3. P2-Defects nur mit dokumentiertem Workaround zulässig.
4. Status nur auf `closed` setzen, wenn Retest `PASS` ist.

## Status

`open` | `in_progress` | `resolved` | `closed` | `deferred`

## Schweregrad

`P1` kritisch | `P2` hoch | `P3` mittel | `P4` niedrig

## Defect-Tabelle

| Defect ID | UAT ID | Titel | Severity | Modul | Repro Steps | Erwartet | Ist | Workaround | Owner | Zieltermin | Status | Retest Ergebnis | Evidenz |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEF-001 |  |  |  |  |  |  |  |  |  |  | open |  |  |

## Freigabekriterium

1. Kein `open` oder `in_progress` mit Severity `P1`.
2. Kein `open` mit Severity `P2` ohne dokumentierten Workaround + Business-Freigabe.
3. Alle als `resolved` markierten Defects haben Retest-Nachweis.
