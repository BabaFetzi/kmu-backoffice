# Browser Regression Protocol

Stand: 2026-02-08
Ziel: Keine P1/P2-Fehler in Safari, Chrome, Edge bei Kernmodulen.

## Matrix

| Browser | Version | Ergebnis | Bemerkung |
|---|---|---|---|
| Safari | 18.x (macOS) | PASS | PDF-Download via html2pdf/jsPDF + Print-Fallback stabil |
| Chrome | latest | PASS | Keine Layout- oder Action-Fehler |
| Edge | latest | PASS | Keine regressiven UI-Probleme |

## Geprüfte Screens
- Aufträge
- Einkauf
- Belege (inkl. OP/Mahnung/CSV)
- Admin (Rollen + Go-Live Status)

## Geprüfte Interaktionen
- Tabellenfilter + Suche
- Action-Buttons in Tabellenzeilen (kein Overlap)
- PDF/CSV Exporte
- Navigation zwischen Modulen

## Offene Risiken
- Keine automatisierten Cross-Browser E2E-Tests; aktuell manuelles Protokoll.
- Für Go-Live empfohlen: monatlicher kurzer Regressionslauf nach Deploy.
