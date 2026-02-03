# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds application code. Entry points live in `src/main.jsx` and `src/App.jsx`.
- `src/pages/` contains top-level views (e.g., `Customers.jsx`, `Orders.jsx`).
- `src/components/` contains reusable UI pieces (e.g., `ItemMovementsPanel.jsx`).
- `src/layout/` and `src/lib/` are for shared layout and utilities.
- `src/assets/` stores bundled assets; `public/` contains static files served as-is.

## Build, Test, and Development Commands
- `npm run dev`: start the Vite dev server with hot reload.
- `npm run build`: produce a production build in `dist/`.
- `npm run preview`: serve the built app locally for a production-like check.
- `npm run lint`: run ESLint across the project.

## Coding Style & Naming Conventions
- Use 2-space indentation in `.jsx` and config files.
- Components and pages use `PascalCase` filenames (e.g., `Orders.jsx`).
- Prefer `camelCase` for functions and variables.
- ESLint is configured in `eslint.config.js`; fix issues before opening a PR.
- Tailwind CSS is available; class usage is scanned from `index.html` and `src/**/*.{js,jsx,ts,tsx}`.

## Testing Guidelines
- No automated test framework is configured yet.
- If you add tests, follow the tool’s defaults and keep them near the code under test (e.g., `src/pages/Orders.test.jsx`).

## Commit & Pull Request Guidelines
- This repository does not include Git history in the workspace, so no commit style could be inferred.
- Suggested convention: `type: short summary` (e.g., `feat: add orders filter`).
- PRs should include a concise description, relevant screenshots for UI updates, and notes about follow-up work or known issues.

## Security & Configuration Tips
- Supabase is used; keep credentials in environment variables and never commit secrets.
- Prefer `.env` files for local configuration and document required keys in the PR description.
