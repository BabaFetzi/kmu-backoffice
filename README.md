# React + Vite

## CI / Quality Gates

Dieses Repository nutzt GitHub Actions unter
`/Users/fabiozahrl/Projects/kmu-backoffice/.github/workflows/ci.yml`.

Bei jedem Push und bei Pull Requests nach `main` laufen automatisch:

1. `npm ci`
2. `npm audit --audit-level=high`
3. `npm test`
4. `npm run lint`
5. `npm run build`

Lokal kannst du die gleichen Gates so prüfen:

```bash
npm ci
npm audit --audit-level=high
npm test
npm run lint
npm run build
```

## Smart Replenishment (Neu)

Im Modul `Artikel` gibt es jetzt einen Bereich **Nachbestell-Vorschläge**:

- Berechnung auf Basis der letzten 30 Tage (`sale - return - cancel`)
- Zielbestand mit Standardwerten:
  - Lieferzeit: 14 Tage
  - Sicherheitsbestand: 7 Tage
- Pro Vorschlag kann direkt eine Aufgabe erzeugt werden (`Aufgabe anlegen`), damit das Team die Nachbestellung abarbeitet.

## Cashflow Forecast (Neu)

Im `Dashboard` gibt es jetzt eine **Liquiditätsvorschau (30 Tage)**:

- erwartete Einzahlungen aus offenen Posten (inkl. überfälliger Anteil)
- erwartete Auszahlungen aus offenen/bestellten Einkaufsaufträgen
- Netto-Prognose und Hinweis auf Einkaufsaufträge ohne Liefertermin

## Bankabgleich CSV (Neu)

Im Modul `Belege` gibt es jetzt den Einstieg **Bankabgleich (CSV)**:

- CSV aus Bankexport laden (Buchungsdatum, Betrag, Referenz/Mitteilung)
- automatische Zuordnung zu offenen Belegen (Rechnungsnr., Auftragsnr., Betrag)
- manuelle Zuordnung für mehrdeutige oder fehlende Treffer direkt im Modal
- Batch-Verbuchung der ausgewählten Matches via `apply_payment`
- Duplikatschutz serverseitig (idempotent): gleicher `BANKCSV|...` Marker pro Beleg wird nur einmal akzeptiert
- Bankimport-Historie mit `Rückgängig` (Undo) pro importierter Zahlung

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
CI test
