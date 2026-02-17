# Unfallmanagement Modul Backlog (Sprint-ready)

Stand: 2026-02-17
Owner: Product + Tech
Status: proposed

## 1) Ziel

Ein release-taugliches Unfallmanagement fuer KMU-Betrieb aufbauen, damit Arbeitsunfaelle einheitlich erfasst, gemeldet, nachverfolgt und ausgewertet werden koennen.

## 2) Annahmen

1. Land: Schweiz (UVG/NBU relevant).
2. Bestehende Rollen bleiben vorerst: `admin`, `buchhaltung`, `einkauf`, `lager`, `read_only`.
3. Keine neue externe Integration im ersten Sprint (Meldung an Versicherer bleibt manuell dokumentiert).

## 3) Nicht-Ziele fuer Sprint 1

1. Keine direkte API-Integration zu Suva/Versicherern.
2. Kein komplexes Case-Management mit juristischer Freigabe-Engine.
3. Kein eigener Dokument-Viewer (nur Upload/Referenz).

## 4) Scope Sprint 1 (Must-Have)

1. Unfallfaelle als eigene Entitaet erfassen (inkl. Pflichtfelder).
2. Fall-Statusfluss: `draft -> reported -> in_treatment -> closed`.
3. Ereignis-Timeline je Fall (Meldung, Rueckfragen, Abschluss).
4. Rollenbasierter Zugriff (RLS) mit least privilege.
5. Basis-KPI fuer Management (Anzahl, Schweregrad, Ausfalltage, offen/geschlossen).

## 5) Datenmodell (Vorschlag)

### 5.1 Tabelle `public.work_incidents`

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid not null default auth.uid()`
- `employee_user_id uuid not null references public.app_users(id) on delete restrict`
- `incident_no text not null` (mandantenweit eindeutig)
- `incident_date date not null`
- `incident_time time`
- `incident_type text not null` check in (`berufsunfall`,`nichtberufsunfall`,`berufskrankheit`,`beinaheunfall`)
- `severity text not null` check in (`leicht`,`mittel`,`schwer`,`kritisch`)
- `location text not null`
- `description text not null`
- `injury_type text`
- `body_part text`
- `witnesses text[] not null default '{}'::text[]`
- `medical_visit_required boolean not null default false`
- `work_incapacity_percent integer not null default 0` check between 0 and 100
- `absence_from date`
- `absence_to date`
- `insurer_name text`
- `insurer_case_no text`
- `reported_to_insurer_at timestamptz`
- `status text not null default 'draft'` check in (`draft`,`reported`,`in_treatment`,`closed`)
- `close_reason text`

Index-Vorschlaege:

- `idx_work_incidents_created_by` on `(created_by)`
- `idx_work_incidents_employee` on `(employee_user_id)`
- `idx_work_incidents_status_date` on `(status, incident_date desc)`
- unique `ux_work_incidents_createdby_no` on `(created_by, incident_no)`

### 5.2 Tabelle `public.work_incident_events`

- `id uuid primary key default gen_random_uuid()`
- `incident_id uuid not null references public.work_incidents(id) on delete cascade`
- `created_at timestamptz not null default now()`
- `created_by uuid not null default auth.uid()`
- `event_type text not null` check in (`created`,`reported`,`note`,`status_change`,`document_added`,`closed`,`reopened`)
- `note text`
- `meta jsonb not null default '{}'::jsonb`

Index-Vorschlaege:

- `idx_work_incident_events_incident_created` on `(incident_id, created_at desc)`

### 5.3 View `public.work_incident_kpi_monthly`

Monatliche Aggregation fuer:

- faelle_total
- faelle_schwer_kritisch
- ausfalltage_sum
- offene_faelle
- durchschnitt_bearbeitungszeit_tage

## 6) RLS / Security-by-default

### 6.1 Zugriffsmatrix (Sprint 1)

- `admin`: full CRUD + Statuswechsel + Abschluss
- `buchhaltung`: read + `reported` setzen + Notizen
- `read_only`: nur lesen
- `einkauf`, `lager`: kein Zugriff auf Unfallmodul

### 6.2 Policies (Kurzkonzept)

- `SELECT`: nur Rollen mit Berechtigung via `public.has_any_role(...)`
- `INSERT`: `admin` und `buchhaltung`
- `UPDATE`: differenziert nach Rolle und Status
- `DELETE`: nur `admin` (optional: in Sprint 1 deaktivieren und nur archivieren)

### 6.3 Datenschutz

- Freitextfelder validieren (Laenge, keine control chars).
- Keine Gesundheitsdaten ausser minimal notwendige Arbeitskontext-Felder.
- Dokumente spaeter in separatem Bucket mit rollenbasiertem Zugriff.

## 7) Migrationen (2 Stueck)

### MIG-1: `supabase/migrations/20260217100000_work_incidents_core.sql`

Inhalt:

1. Tabellen `work_incidents` + constraints + indexes
2. `updated_at` trigger via `public.set_updated_at()`
3. RLS aktivieren
4. Rollen-Policies fuer core CRUD
5. Incident-Nummer-Generator-Funktion (z. B. `next_work_incident_no()`)

### MIG-2: `supabase/migrations/20260217103000_work_incident_workflow_and_views.sql`

Inhalt:

1. Tabelle `work_incident_events`
2. RPC `public.report_work_incident(p_incident_id uuid, p_note text)`
3. RPC `public.close_work_incident(p_incident_id uuid, p_reason text)`
4. View `work_incident_kpi_monthly`
5. Event-Write Hooks bei Statuswechseln

## 8) UI-Screens (React)

### Screen A: `/incidents` (Liste)

- Filter: Status, Typ, Schweregrad, Mitarbeiter, Zeitraum
- Suche: incident_no, Mitarbeiter, Ort
- Spalten: Fallnummer, Datum, Mitarbeiter, Typ, Schweregrad, Status, Ausfalltage
- Aktionen: Neu, Oeffnen, Export CSV

### Screen B: `/incidents/new` (Erfassung)

Sektionen:

1. Basisdaten (Mitarbeiter, Datum/Uhrzeit, Ort)
2. Unfallbeschreibung
3. Medizin / Arbeitsunfaehigkeit
4. Meldedaten Versicherer

### Screen C: `/incidents/:id` (Fallakte)

- Kopf mit Status-Chips
- Timeline aus `work_incident_events`
- Bearbeitungsbereich fuer Notiz/Statuswechsel
- Optionaler Dokumentenbereich (Sprint 1: Platzhalter + TODO)

### Screen D: Dashboard-Widget

- Offene Faelle
- Schwere/Kritische Faelle 30 Tage
- Ausfalltage 30 Tage

## 9) Tests (Regressionsschutz)

### 9.1 SQL-Tests

Dateien erweitern:

- `supabase/tests/critical_cases.sql`
- `supabase/tests/go_live_acceptance.sql`

Neue Testfaelle:

1. Tabellen/Views/Funktionen existieren
2. Invalid status/type wird geblockt
3. `work_incapacity_percent` ausserhalb 0..100 wird geblockt
4. Incident-Nummer eindeutig pro Mandant
5. Unerlaubte Rolle kann nicht schreiben
6. Statuswechsel nur ueber freigegebene RPCs
7. Event-Timeline wird bei report/close geschrieben
8. Closed-Fall kann ohne Reopen nicht mehr frei geaendert werden

### 9.2 Frontend-Tests (Vitest)

Neue Tests (mindestens):

1. Create-Form Pflichtfelder
2. Statusfilter in Liste
3. Berechtigungen: Buttons je Rolle sichtbar/nicht sichtbar
4. Fehlermeldung bei API-Fehler sauber angezeigt

### 9.3 UAT-Faelle

In `docs/testing/uat-test-matrix.md` aufnehmen:

- UAT-INC-01 Unfall erfassen und melden
- UAT-INC-02 Statusfluss inkl. Abschluss
- UAT-INC-03 Rollenrechte korrekt
- UAT-INC-04 KPI-Werte plausibel

## 10) Sprint-Schnitt (5 Arbeitstage)

1. Tag 1: MIG-1 + RLS + Grundtests
2. Tag 2: MIG-2 + RPC + SQL-Tests
3. Tag 3: Liste + Create-Screen
4. Tag 4: Detailscreen + Timeline + Rechte in UI
5. Tag 5: E2E/UAT + Doku + PR-Hardening

## 11) Release-Gates fuer dieses Modul

1. Keine offenen P1/P2 Bugs im Unfallmodul
2. SQL- und UI-Tests gruen
3. Rollenrechte fachlich abgenommen
4. Monitoring-Signal fuer offene schwere Faelle aktiv

## 12) Offene Entscheidungen (Business)

1. Soll `buchhaltung` wirklich schreiben duerfen oder nur lesen?
2. Welche Felder sind fuer Versicherer-Meldung zwingend?
3. Wie lang muessen Unfalldaten intern aufbewahrt werden?

## 13) Definition of Done (Modul)

1. Unfallfall kann erstellt, gemeldet, verfolgt, abgeschlossen werden.
2. Zugriff ist rollenbasiert abgesichert (RLS + UI).
3. KPI-Widget zeigt reproduzierbare Zahlen.
4. Tests und UAT-Faelle sind dokumentiert und gruen.
