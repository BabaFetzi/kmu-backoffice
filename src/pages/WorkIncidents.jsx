import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("de-CH");
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({ children, tone = "default" }) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-white text-slate-700";

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${toneCls}`}>{children}</span>;
}

function statusTone(status) {
  if (status === "closed") return "ok";
  if (status === "reported") return "warn";
  if (status === "in_treatment") return "warn";
  return "default";
}

function severityTone(severity) {
  if (severity === "kritisch") return "danger";
  if (severity === "schwer") return "warn";
  return "default";
}

const INCIDENT_TYPE_OPTIONS = [
  { value: "berufsunfall", label: "Berufsunfall" },
  { value: "nichtberufsunfall", label: "Nichtberufsunfall" },
  { value: "berufskrankheit", label: "Berufskrankheit" },
  { value: "beinaheunfall", label: "Beinaheunfall" },
];

const SEVERITY_OPTIONS = [
  { value: "leicht", label: "Leicht" },
  { value: "mittel", label: "Mittel" },
  { value: "schwer", label: "Schwer" },
  { value: "kritisch", label: "Kritisch" },
];

export default function WorkIncidents() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [err, setErr] = useState("");

  const [employees, setEmployees] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [events, setEvents] = useState([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [employeeUserId, setEmployeeUserId] = useState("");
  const [incidentDate, setIncidentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [incidentTime, setIncidentTime] = useState("");
  const [incidentType, setIncidentType] = useState("berufsunfall");
  const [severity, setSeverity] = useState("mittel");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [medicalVisitRequired, setMedicalVisitRequired] = useState(false);
  const [workIncapacityPercent, setWorkIncapacityPercent] = useState("0");

  const [reportNote, setReportNote] = useState("");
  const [closeReason, setCloseReason] = useState("");

  const loadAll = useCallback(async (preferSelectedId = "") => {
    setLoading(true);
    setErr("");

    const [{ data: employeeRows, error: employeeErr }, { data: incidentRows, error: incidentErr }] = await Promise.all([
      supabase.from("app_users").select("id, email").order("email", { ascending: true }),
      supabase
        .from("work_incidents")
        .select(
          "id, incident_no, employee_user_id, incident_date, incident_time, incident_type, severity, location, description, status, close_reason, reported_to_insurer_at, medical_visit_required, work_incapacity_percent, created_at, updated_at"
        )
        .order("incident_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (employeeErr) setErr(prettySupabaseError(employeeErr));
    if (incidentErr) setErr(prettySupabaseError(incidentErr));

    const safeEmployees = employeeRows || [];
    const safeIncidents = incidentRows || [];

    setEmployees(safeEmployees);
    setIncidents(safeIncidents);

    const effectiveSelectedId =
      (preferSelectedId && safeIncidents.some((x) => x.id === preferSelectedId) && preferSelectedId) ||
      (selectedId && safeIncidents.some((x) => x.id === selectedId) && selectedId) ||
      (safeIncidents[0]?.id || "");

    setSelectedId(effectiveSelectedId);

    if (effectiveSelectedId) {
      const { data: eventRows, error: eventErr } = await supabase
        .from("work_incident_events")
        .select("id, incident_id, event_type, note, meta, created_at, created_by")
        .eq("incident_id", effectiveSelectedId)
        .order("created_at", { ascending: false });

      if (eventErr) setErr((prev) => prev || prettySupabaseError(eventErr));
      setEvents(eventRows || []);
    } else {
      setEvents([]);
    }

    setLoading(false);
  }, [selectedId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAll();
    });
  }, [loadAll]);

  async function loadEvents(incidentId) {
    if (!incidentId) {
      setEvents([]);
      return;
    }

    const { data, error } = await supabase
      .from("work_incident_events")
      .select("id, incident_id, event_type, note, meta, created_at, created_by")
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: false });

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setEvents(data || []);
  }

  const employeeById = useMemo(() => {
    const map = new Map();
    employees.forEach((row) => map.set(row.id, row.email || row.id));
    return map;
  }, [employees]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return incidents.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!term) return true;
      const employee = (employeeById.get(row.employee_user_id) || "").toLowerCase();
      return (
        (row.incident_no || "").toLowerCase().includes(term) ||
        (row.location || "").toLowerCase().includes(term) ||
        (row.description || "").toLowerCase().includes(term) ||
        employee.includes(term)
      );
    });
  }, [incidents, q, statusFilter, employeeById]);

  const selected = filtered.find((row) => row.id === selectedId) || incidents.find((row) => row.id === selectedId) || null;

  async function createIncident(e) {
    e.preventDefault();
    setErr("");

    if (!employeeUserId) return setErr("Bitte Mitarbeiter auswaehlen.");
    if (!incidentDate) return setErr("Unfalldatum fehlt.");
    if (!location.trim()) return setErr("Ort fehlt.");
    if (!description.trim()) return setErr("Beschreibung fehlt.");

    const incapacity = Number(workIncapacityPercent);
    if (!Number.isFinite(incapacity) || incapacity < 0 || incapacity > 100) {
      return setErr("Arbeitsunfaehigkeit muss zwischen 0 und 100 liegen.");
    }

    setSaving(true);

    const payload = {
      employee_user_id: employeeUserId,
      incident_date: incidentDate,
      incident_time: incidentTime || null,
      incident_type: incidentType,
      severity,
      location: location.trim(),
      description: description.trim(),
      medical_visit_required: medicalVisitRequired,
      work_incapacity_percent: incapacity,
    };

    const { data, error } = await supabase.from("work_incidents").insert(payload).select("id").single();

    setSaving(false);

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setCreateOpen(false);
    setLocation("");
    setDescription("");
    setIncidentTime("");
    setMedicalVisitRequired(false);
    setWorkIncapacityPercent("0");

    await loadAll(data?.id || "");
  }

  async function reportSelectedIncident() {
    if (!selected) return;
    setErr("");
    setActionLoading(true);

    const { error } = await supabase.rpc("report_work_incident", {
      p_incident_id: selected.id,
      p_note: reportNote.trim() || null,
    });

    setActionLoading(false);

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setReportNote("");
    await loadAll(selected.id);
  }

  async function closeSelectedIncident() {
    if (!selected) return;
    const reason = closeReason.trim();
    if (!reason) return setErr("Abschlussgrund fehlt.");

    setErr("");
    setActionLoading(true);

    const { error } = await supabase.rpc("close_work_incident", {
      p_incident_id: selected.id,
      p_reason: reason,
    });

    setActionLoading(false);

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setCloseReason("");
    await loadAll(selected.id);
  }

  async function selectIncident(id) {
    setSelectedId(id);
    await loadEvents(id);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Unfallmeldungen</h1>
            <p className="text-sm text-slate-500">Unfaelle erfassen, an Versicherer melden und revisionssicher abschliessen.</p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Neuer Unfallfall
          </button>
        </div>

        {err && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suche: Nummer, Mitarbeiter, Ort..."
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            aria-label="Unfallfaelle suchen"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            aria-label="Status filtern"
          >
            <option value="all">Alle Status</option>
            <option value="draft">Draft</option>
            <option value="reported">Reported</option>
            <option value="in_treatment">In treatment</option>
            <option value="closed">Closed</option>
          </select>
          <button
            onClick={() => loadAll(selectedId)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Neu laden
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-medium text-slate-600">Faelle ({filtered.length})</div>
          <div className="max-h-[560px] overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Nr.</th>
                  <th className="px-3 py-2 text-left">Mitarbeiter</th>
                  <th className="px-3 py-2 text-left">Datum</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Schwere</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      Lade Unfallfaelle...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      Keine Unfallfaelle gefunden.
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.map((row) => {
                    const isActive = row.id === selected?.id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => {
                          void selectIncident(row.id);
                        }}
                        className={`cursor-pointer border-t border-slate-100 ${isActive ? "bg-slate-50" : "hover:bg-slate-50/70"}`}
                      >
                        <td className="px-3 py-2 font-medium text-slate-800">{row.incident_no}</td>
                        <td className="px-3 py-2 text-slate-600">{employeeById.get(row.employee_user_id) || row.employee_user_id}</td>
                        <td className="px-3 py-2 text-slate-600">{formatDate(row.incident_date)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={severityTone(row.severity)}>{row.severity}</Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-medium text-slate-600">Detail</div>
            {!selected && <div className="text-sm text-slate-500">Kein Unfallfall ausgewaehlt.</div>}
            {selected && (
              <div className="space-y-3 text-sm">
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Nummer</div>
                    <div className="font-medium text-slate-800">{selected.incident_no}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Mitarbeiter</div>
                    <div className="font-medium text-slate-800">{employeeById.get(selected.employee_user_id) || selected.employee_user_id}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Datum</div>
                    <div className="font-medium text-slate-800">{formatDate(selected.incident_date)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Ort</div>
                    <div className="font-medium text-slate-800">{selected.location}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">{selected.description}</div>

                <div className="flex flex-wrap gap-2">
                  <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                  <Badge tone={severityTone(selected.severity)}>{selected.severity}</Badge>
                  {selected.medical_visit_required ? <Badge tone="warn">Arztbesuch</Badge> : <Badge>Kein Arztbesuch</Badge>}
                  <Badge>AUF {selected.work_incapacity_percent || 0}%</Badge>
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <label className="block text-xs uppercase tracking-wide text-slate-400">Notiz fuer Meldung</label>
                  <textarea
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    rows={2}
                    placeholder="Optional: Details zur Meldung an Versicherer"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                  <button
                    onClick={reportSelectedIncident}
                    disabled={actionLoading || selected.status === "closed"}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    An Versicherer melden
                  </button>
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <label className="block text-xs uppercase tracking-wide text-slate-400">Abschlussgrund</label>
                  <textarea
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    rows={2}
                    placeholder="Pflicht fuer Abschluss"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                  <button
                    onClick={closeSelectedIncident}
                    disabled={actionLoading || selected.status === "closed"}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Fall abschliessen
                  </button>
                </div>

                {selected.close_reason && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    Abschlussgrund: {selected.close_reason}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-medium text-slate-600">Event-Historie</div>
            <div className="max-h-[280px] space-y-2 overflow-auto">
              {events.length === 0 && <div className="text-sm text-slate-500">Keine Events vorhanden.</div>}
              {events.map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Badge>{event.event_type}</Badge>
                    <span className="text-xs text-slate-500">{formatDateTime(event.created_at)}</span>
                  </div>
                  {event.note && <div className="mt-2 text-slate-700">{event.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Neuen Unfallfall erfassen</h2>
                <p className="text-sm text-slate-500">Pflichtdaten erfassen, danach Meldung und Abschluss ueber Workflow.</p>
              </div>
              <button className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setCreateOpen(false)}>
                Schliessen
              </button>
            </div>

            <form onSubmit={createIncident} className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Mitarbeiter</label>
                <select
                  value={employeeUserId}
                  onChange={(e) => setEmployeeUserId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">Bitte waehlen</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.email || emp.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Unfalldatum</label>
                <input
                  type="date"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Zeit (optional)</label>
                <input
                  type="time"
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Typ</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  {INCIDENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Schweregrad</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                >
                  {SEVERITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Ort</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="z.B. Lagerhalle Nord"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Beschreibung</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  placeholder="Was ist passiert?"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Arbeitsunfaehigkeit (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={workIncapacityPercent}
                  onChange={(e) => setWorkIncapacityPercent(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={medicalVisitRequired}
                    onChange={(e) => setMedicalVisitRequired(e.target.checked)}
                  />
                  Arztbesuch erforderlich
                </label>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Speichern..." : "Unfallfall speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
