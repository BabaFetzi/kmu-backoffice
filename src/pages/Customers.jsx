import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function Badge({ children, tone = "default" }) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
      : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${toneCls}`}>
      {children}
    </span>
  );
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

// super simple similarity: checks substring overlap
function isProbablyDuplicate(nameA, nameB) {
  const a = norm(nameA);
  const b = norm(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}

function parseTags(input) {
  return String(input || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function tagsToString(tagsArr) {
  if (!Array.isArray(tagsArr)) return "";
  return tagsArr.join(", ");
}

export default function Customers() {
  const searchRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active | archived | all
  const [err, setErr] = useState("");

  // Create modal
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [dupHints, setDupHints] = useState([]);

  // Drawer (edit)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const [editCompany, setEditCompany] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState("");

  // Track dirty state (unsaved changes)
  const [isDirty, setIsDirty] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("customers")
      .select("id, company_name, contact_name, email, status, tags, notes, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) setErr(prettySupabaseError(error));
    setCustomers(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Recompute duplicate hints when typing companyName
  useEffect(() => {
    const input = companyName.trim();
    if (!input) {
      setDupHints([]);
      return;
    }
    const hits = customers
      .filter((c) => isProbablyDuplicate(input, c.company_name))
      .slice(0, 5);
    setDupHints(hits);
  }, [companyName, customers]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return customers.filter((c) => {
      const st = c.status || "active";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!s) return true;

      return (
        (c.company_name || "").toLowerCase().includes(s) ||
        (c.contact_name || "").toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s) ||
        tagsToString(c.tags).toLowerCase().includes(s)
      );
    });
  }, [customers, q, statusFilter]);

  async function createCustomer(e) {
    e.preventDefault();
    setErr("");

    const name = companyName.trim();
    if (!name) {
      setErr("Firmenname fehlt.");
      return;
    }

    const exact = customers.find((c) => norm(c.company_name) === norm(name));
    if (exact) {
      const ok = confirm(
        `Es gibt bereits einen Kunden mit exakt gleichem Namen ("${exact.company_name}"). Trotzdem anlegen?`
      );
      if (!ok) return;
    }

    const payload = {
      company_name: name,
      contact_name: contactName.trim() || null,
      email: email.trim() || null,
      status: "active",
    };

    const { error } = await supabase.from("customers").insert(payload);
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setCompanyName("");
    setContactName("");
    setEmail("");
    setOpen(false);
    await load();
  }

  async function setArchived(id, archived) {
    setErr("");
    const { error } = await supabase
      .from("customers")
      .update({ status: archived ? "archived" : "active" })
      .eq("id", id);

    if (error) setErr(prettySupabaseError(error));
    await load();
  }

  async function hardDelete(id) {
    const ok = confirm("Hard-Delete wirklich? (ERP-Standard wäre archivieren)");
    if (!ok) return;
    setErr("");
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) setErr(prettySupabaseError(error));
    await load();
  }

  function openDrawer(c) {
    setSelected(c);
    setEditCompany(c.company_name || "");
    setEditContact(c.contact_name || "");
    setEditEmail(c.email || "");
    setEditStatus(c.status || "active");
    setEditNotes(c.notes || "");
    setEditTags(tagsToString(c.tags));
    setIsDirty(false);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (isDirty) {
      const ok = confirm("Ungespeicherte Änderungen verwerfen?");
      if (!ok) return;
    }
    setDrawerOpen(false);
    setSelected(null);
    setIsDirty(false);
  }

  async function saveCustomerEdits(e) {
    e.preventDefault();
    if (!selected) return;

    setErr("");

    const payload = {
      company_name: editCompany.trim(),
      contact_name: editContact.trim() || null,
      email: editEmail.trim() || null,
      status: editStatus,
      notes: editNotes.trim() || null,
      tags: parseTags(editTags),
    };

    if (!payload.company_name) {
      setErr("Firmenname fehlt.");
      return;
    }

    const { error } = await supabase.from("customers").update(payload).eq("id", selected.id);

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    setIsDirty(false);
    setDrawerOpen(false);
    setSelected(null);
    await load();
  }

  // Mark dirty on any edit change (drawer only)
  useEffect(() => {
    if (!drawerOpen) return;
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCompany, editContact, editEmail, editStatus, editNotes, editTags]);

  const activeCount = customers.filter((c) => (c.status || "active") === "active").length;
  const archivedCount = customers.filter((c) => (c.status || "active") === "archived").length;

  // Global shortcuts: ESC closes, Cmd/Ctrl+K focuses search
  useEffect(() => {
    function onKeyDown(e) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "Escape") {
        if (open) setOpen(false);
        if (drawerOpen) closeDrawer();
      }

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, drawerOpen, isDirty]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      {/* LEFT */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Kunden</h1>
            <p className="text-sm text-slate-400">
              Liste, Suche, Neu, Archivieren, Bearbeiten (Drawer) – ERP-Style.
              <span className="ml-2 text-xs text-slate-500">Shortcut: Cmd/Ctrl + K (Suche)</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="ok">{activeCount} aktiv</Badge>
              <Badge tone="warn">{archivedCount} archiviert</Badge>
            </div>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            + Neuer Kunde
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen (Firma, Kontakt, Email, Tags)…"
            className="w-full md:w-[420px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFilter("active")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                statusFilter === "active"
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-transparent hover:bg-white/5"
              }`}
            >
              Aktiv
            </button>
            <button
              onClick={() => setStatusFilter("archived")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                statusFilter === "archived"
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-transparent hover:bg-white/5"
              }`}
            >
              Archiv
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                statusFilter === "all"
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-transparent hover:bg-white/5"
              }`}
            >
              Alle
            </button>
          </div>

          <div className="md:ml-auto text-xs text-slate-400">
            {loading ? "Lade…" : `${filtered.length} Treffer`}
          </div>
        </div>

        {err && (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-0 bg-white/5 px-4 py-3 text-xs text-slate-300">
            <div>Firma</div>
            <div>Kontakt</div>
            <div>Email</div>
            <div className="text-right">Aktion</div>
          </div>

          <div className="divide-y divide-white/10">
            {loading ? (
              <div className="px-4 py-4 text-sm text-slate-400">Lade Daten…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400">Keine Kunden gefunden.</div>
            ) : (
              filtered.map((c) => {
                const st = c.status || "active";
                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-0 px-4 py-3 text-sm items-center hover:bg-white/[0.03] cursor-pointer"
                    onClick={() => openDrawer(c)}
                    title="Klicken um Details zu öffnen"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="font-medium truncate">{c.company_name}</div>
                      {st === "archived" && <Badge tone="warn">archiviert</Badge>}
                      {Array.isArray(c.tags) && c.tags.length > 0 && (
                        <span className="hidden md:inline text-xs text-slate-400 truncate">
                          • {c.tags.join(", ")}
                        </span>
                      )}
                    </div>

                    <div className="text-slate-300 truncate">{c.contact_name || "—"}</div>
                    <div className="text-slate-300 truncate">{c.email || "—"}</div>

                    {/* stopPropagation: Buttons sollen nicht auch Drawer öffnen */}
                    <div
                      className="text-right flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {st === "active" ? (
                        <button
                          onClick={() => setArchived(c.id, true)}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                          title="Archivieren"
                        >
                          Archivieren
                        </button>
                      ) : (
                        <button
                          onClick={() => setArchived(c.id, false)}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                          title="Reaktivieren"
                        >
                          Reaktivieren
                        </button>
                      )}

                      <button
                        onClick={() => hardDelete(c.id)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                        title="Hard delete"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: KI Panel */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 h-fit sticky top-[72px]">
        <div className="flex items-center justify-between">
          <div className="font-semibold">KI-Assistent</div>
          <Badge tone="ok">bereit</Badge>
        </div>

        <div className="mt-2 text-sm text-slate-300">
          Nächste Ausbaustufe: Dublettenwarnung, Feld-Erklärungen, Vorschläge, Validierung.
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
            <div className="text-xs text-slate-400">Beispiel</div>
            <div className="mt-1 text-slate-200">
              „Ich sehe, du legst einen Kunden an. Soll ich prüfen, ob es Dubletten gibt?“
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
            <div className="text-xs text-slate-400">Tipp</div>
            <div className="mt-1 text-slate-200">
              ERP-Standard: lieber <span className="text-slate-100 font-medium">archivieren</span> statt löschen.
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
            <div className="text-xs text-slate-400">Shortcuts</div>
            <div className="mt-1 text-slate-200">Cmd/Ctrl+K → Suche, Esc → schliessen</div>
          </div>
        </div>
      </div>

      {/* Modal: Create */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950 p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Neuer Kunde</div>
                <div className="text-sm text-slate-400">MVP + Dubletten-Hinweis (KI-ready).</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <form onSubmit={createCustomer} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Firmenname *</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  placeholder="z. B. Müller AG"
                />
              </div>

              {dupHints.length > 0 && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <div className="font-medium">Mögliche Dubletten:</div>
                  <ul className="mt-1 list-disc pl-5 text-amber-100/90">
                    {dupHints.map((d) => (
                      <li key={d.id}>
                        {d.company_name}{" "}
                        <span className="text-amber-200/70">
                          ({(d.status || "active") === "archived" ? "archiviert" : "aktiv"})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kontakt</label>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="z. B. Petra Müller"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="petra@mueller.ch"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm hover:bg-white/5"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                >
                  Speichern
                </button>
              </div>
            </form>

            <div className="mt-3 text-xs text-slate-500">
              Hinweis: Dublettencheck ist aktuell heuristisch. Später ersetzt durch KI + fuzzy matching.
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Edit */}
      {drawerOpen && selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-white/10 bg-slate-950 p-5 overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Kunde bearbeiten</div>
                <div className="text-sm text-slate-400">{selected.company_name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={editStatus === "archived" ? "warn" : "ok"}>
                    {editStatus === "archived" ? "archiviert" : "aktiv"}
                  </Badge>
                  {isDirty && <Badge tone="warn">ungespeichert</Badge>}
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveCustomerEdits} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Firmenname *</label>
                <input
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kontakt</label>
                  <input
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Email</label>
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                  >
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  {editStatus === "active" ? (
                    <button
                      type="button"
                      onClick={() => setEditStatus("archived")}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                      title="Archivieren"
                    >
                      Archivieren
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditStatus("active")}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                      title="Reaktivieren"
                    >
                      Reaktivieren
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Tags (Komma-separiert)</label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  placeholder="z.B. vip, b2b, partner"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Notizen</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  placeholder="ERP-Notizen (z.B. Ansprechpartner, Besonderheiten, Konditionen …)"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm hover:bg-white/5"
                >
                  Schliessen
                </button>
                <button
                  type="submit"
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                >
                  Speichern
                </button>
              </div>
            </form>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-medium">KI-Idee (nächster Sprint)</div>
              <div className="text-sm text-slate-300 mt-1">
                „Schlage Tags vor“, „Formuliere Notizen sauber“, „Erkenne Risiken/Dubletten“ – direkt hier im Drawer.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
