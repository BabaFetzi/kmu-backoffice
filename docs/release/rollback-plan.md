# Rollback Plan

## Ziel

Schnelle und kontrollierte Rücknahme eines fehlerhaften Releases mit minimalem Datenrisiko.

## Voraussetzungen

1. Letzte erfolgreiche Migration-ID dokumentiert.
2. DB-Backup vor Release erstellt.
3. Frontend-Artefakt des letzten stabilen Builds verfügbar.

## Ablauf im Incident

1. Release stoppen (keine weiteren Deploys).
2. Fehlerbild klassifizieren:
   - P1: Dateninkonsistenz/Workflow blockiert
   - P2: Teilfunktion gestört
3. Sofortmaßnahme:
   - Feature-Flag/Hotfix wenn möglich
   - sonst Rollback

## Technisches Rollback (DB)

1. Prüfen, welche Migration zuletzt eingespielt wurde.
2. Wenn rückwärtskompatibel:
   - kompensierende Migration ausführen.
3. Wenn nicht rückwärtskompatibel:
   - Restore auf Snapshot (Staging zuerst, dann Produktion).
4. Integritäts-Checks ausführen:
   - kritische SQL-Tests
   - `data_quality_issues_view`

## Technisches Rollback (Frontend)

1. Vorherigen stabilen Build deployen.
2. Browser-Smoke-Test auf Kernflows durchführen.
3. Incident-Log mit Zeitachse aktualisieren.

## Freigabe nach Rollback

1. P1/P2-Fehler nicht mehr reproduzierbar.
2. Kernprozess-Suite grün.
3. Go/No-Go Entscheidung erneut dokumentiert.
