import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function Badge({ children, tone = "default" }) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-white text-slate-800";

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

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
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
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("CH");
  const [vatUid, setVatUid] = useState("");
  const [dupHints, setDupHints] = useState([]);

  // Drawer (edit)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const [editCompany, setEditCompany] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editStreet2, setEditStreet2] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editCountry, setEditCountry] = useState("CH");
  const [editVatUid, setEditVatUid] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState("");
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [customerDocs, setCustomerDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsErr, setDocsErr] = useState("");

  // Track dirty state (unsaved changes)
  const [isDirty, setIsDirty] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, company_name, contact_name, email, status, tags, notes, created_at, updated_at, street, street2, zip, city, country, vat_uid"
      )
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
      street: street.trim() || null,
      street2: street2.trim() || null,
      zip: zip.trim() || null,
      city: city.trim() || null,
      country: country.trim() || "CH",
      vat_uid: vatUid.trim() || null,
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
    setStreet("");
    setStreet2("");
    setZip("");
    setCity("");
    setCountry("CH");
    setVatUid("");
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

  const loadCustomerDocs = useCallback(async (customerId) => {
    if (!customerId) return;
    setDocsLoading(true);
    setDocsErr("");
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_no, document_type, invoice_no, invoice_date, credit_note_no, credit_note_date, gross_total, created_at"
        )
        .eq("customer_id", customerId)
        .or("invoice_no.not.is.null,credit_note_no.not.is.null")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCustomerDocs(data || []);
    } catch (e) {
      setDocsErr(prettySupabaseError(e));
      setCustomerDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  const openDrawer = useCallback((c) => {
    setSelected(c);
    setEditCompany(c.company_name || "");
    setEditContact(c.contact_name || "");
    setEditEmail(c.email || "");
    setEditStreet(c.street || "");
    setEditStreet2(c.street2 || "");
    setEditZip(c.zip || "");
    setEditCity(c.city || "");
    setEditCountry(c.country || "CH");
    setEditVatUid(c.vat_uid || "");
    setEditStatus(c.status || "active");
    setEditNotes(c.notes || "");
    setEditTags(tagsToString(c.tags));
    setIsDirty(false);
    setDrawerOpen(true);
    loadCustomerDocs(c.id);
  }, [loadCustomerDocs]);

  useEffect(() => {
    if (deepLinkHandled || customers.length === 0) return;
    const raw = localStorage.getItem("deepLink");
    if (!raw) return;
    try {
      const dl = JSON.parse(raw);
      if (dl.module === "customers" && dl.id) {
        const c = customers.find((x) => x.id === dl.id);
        if (c) {
          openDrawer(c);
          localStorage.removeItem("deepLink");
          setDeepLinkHandled(true);
        }
      }
    } catch {
      localStorage.removeItem("deepLink");
    }
  }, [customers, deepLinkHandled, openDrawer]);

  function closeDrawer() {
    if (isDirty) {
      const ok = confirm("Ungespeicherte Änderungen verwerfen?");
      if (!ok) return;
    }
    setDrawerOpen(false);
    setSelected(null);
    setIsDirty(false);
    setCustomerDocs([]);
    setDocsErr("");
  }

  function openOrderFromCustomer(orderId) {
    if (!orderId) return;
    window.dispatchEvent(
      new CustomEvent("app:navigate", {
        detail: { module: "orders", id: orderId },
      })
    );
  }

  async function saveCustomerEdits(e) {
    e.preventDefault();
    if (!selected) return;

    setErr("");

    const payload = {
      company_name: editCompany.trim(),
      contact_name: editContact.trim() || null,
      email: editEmail.trim() || null,
      street: editStreet.trim() || null,
      street2: editStreet2.trim() || null,
      zip: editZip.trim() || null,
      city: editCity.trim() || null,
      country: editCountry.trim() || "CH",
      vat_uid: editVatUid.trim() || null,
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
    <div className="erp-page grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      {/* LEFT */}
      <div className="erp-page">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h1 className="erp-page-title">Kunden</h1>
            <p className="erp-page-subtitle">
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
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
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
            className="w-full md:w-[420px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFilter("active")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                statusFilter === "active"
                  ? "border-slate-300 bg-slate-100"
                  : "border-slate-200 bg-transparent hover:bg-slate-100"
              }`}
            >
              Aktiv
            </button>
            <button
              onClick={() => setStatusFilter("archived")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                statusFilter === "archived"
                  ? "border-slate-300 bg-slate-100"
                  : "border-slate-200 bg-transparent hover:bg-slate-100"
              }`}
            >
              Archiv
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={`rounded-xl border px-3 py-2 text-sm ${
                statusFilter === "all"
                  ? "border-slate-300 bg-slate-100"
                  : "border-slate-200 bg-transparent hover:bg-slate-100"
              }`}
            >
              Alle
            </button>
          </div>

          <div className="md:ml-auto text-xs text-slate-500">
            {loading ? "Lade…" : `${filtered.length} Treffer`}
          </div>
        </div>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-0 bg-white px-4 py-3 text-xs text-slate-700">
            <div>Firma</div>
            <div>Kontakt</div>
            <div>Email</div>
            <div className="text-right">Aktion</div>
          </div>

          <div className="divide-y divide-slate-200">
            {loading ? (
              <div className="px-4 py-4 text-sm text-slate-500">Lade Daten…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">Keine Kunden gefunden.</div>
            ) : (
              filtered.map((c) => {
                const st = c.status || "active";
                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-0 px-4 py-3 text-sm items-center hover:bg-slate-50 cursor-pointer"
                    onClick={() => openDrawer(c)}
                    title="Klicken um Details zu öffnen"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="font-medium truncate">{c.company_name}</div>
                      {st === "archived" && <Badge tone="warn">archiviert</Badge>}
                      {Array.isArray(c.tags) && c.tags.length > 0 && (
                        <span className="hidden md:inline text-xs text-slate-500 truncate">
                          • {c.tags.join(", ")}
                        </span>
                      )}
                    </div>

                    <div className="text-slate-700 truncate">{c.contact_name || "—"}</div>
                    <div className="text-slate-700 truncate">{c.email || "—"}</div>

                    {/* stopPropagation: Buttons sollen nicht auch Drawer öffnen */}
                    <div
                      className="text-right flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {st === "active" ? (
                        <button
                          onClick={() => setArchived(c.id, true)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                          title="Archivieren"
                        >
                          Archivieren
                        </button>
                      ) : (
                        <button
                          onClick={() => setArchived(c.id, false)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                          title="Reaktivieren"
                        >
                          Reaktivieren
                        </button>
                      )}

                      <button
                        onClick={() => hardDelete(c.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
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
      <div className="erp-card h-fit sticky top-[72px]">
        <div className="flex items-center justify-between">
          <div className="font-semibold">KI-Assistent</div>
          <Badge tone="ok">bereit</Badge>
        </div>

        <div className="mt-2 text-sm text-slate-700">
          Nächste Ausbaustufe: Dublettenwarnung, Feld-Erklärungen, Vorschläge, Validierung.
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
            <div className="text-xs text-slate-500">Beispiel</div>
            <div className="mt-1 text-slate-800">
              „Ich sehe, du legst einen Kunden an. Soll ich prüfen, ob es Dubletten gibt?“
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
            <div className="text-xs text-slate-500">Tipp</div>
            <div className="mt-1 text-slate-800">
              ERP-Standard: lieber <span className="text-slate-900 font-medium">archivieren</span> statt löschen.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
            <div className="text-xs text-slate-500">Shortcuts</div>
            <div className="mt-1 text-slate-800">Cmd/Ctrl+K → Suche, Esc → schliessen</div>
          </div>
        </div>
      </div>

      {/* Modal: Create */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Neuer Kunde</div>
                <div className="text-sm text-slate-500">MVP + Dubletten-Hinweis (KI-ready).</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={createCustomer} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Firmenname *</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="z. B. Müller AG"
                />
              </div>

              {dupHints.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <div className="font-medium">Mögliche Dubletten:</div>
                  <ul className="mt-1 list-disc pl-5 text-amber-700/90">
                    {dupHints.map((d) => (
                      <li key={d.id}>
                        {d.company_name}{" "}
                        <span className="text-amber-700/70">
                          ({(d.status || "active") === "archived" ? "archiviert" : "aktiv"})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Kontakt</label>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="z. B. Petra Müller"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="petra@mueller.ch"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Strasse</label>
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="Hauptstrasse 1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Adresszusatz</label>
                  <input
                    value={street2}
                    onChange={(e) => setStreet2(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="c/o ..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">PLZ</label>
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="8000"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Ort</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="Zürich"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Land</label>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="CH"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">MWST‑UID</label>
                <input
                  value={vatUid}
                  onChange={(e) => setVatUid(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="CHE-123.456.789 MWST"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 bg-transparent px-4 py-2 text-sm hover:bg-slate-100"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
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
          <div className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-slate-200 bg-slate-50 p-5 overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Kunde bearbeiten</div>
                <div className="text-sm text-slate-500">{selected.company_name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={editStatus === "archived" ? "warn" : "ok"}>
                    {editStatus === "archived" ? "archiviert" : "aktiv"}
                  </Badge>
                  {isDirty && <Badge tone="warn">ungespeichert</Badge>}
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveCustomerEdits} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Firmenname *</label>
                <input
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Kontakt</label>
                  <input
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Email</label>
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Strasse</label>
                  <input
                    value={editStreet}
                    onChange={(e) => setEditStreet(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Adresszusatz</label>
                  <input
                    value={editStreet2}
                    onChange={(e) => setEditStreet2(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">PLZ</label>
                  <input
                    value={editZip}
                    onChange={(e) => setEditZip(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Ort</label>
                  <input
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Land</label>
                  <input
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">MWST‑UID</label>
                <input
                  value={editVatUid}
                  onChange={(e) => setEditVatUid(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
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
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                      title="Archivieren"
                    >
                      Archivieren
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditStatus("active")}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                      title="Reaktivieren"
                    >
                      Reaktivieren
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Tags (Komma-separiert)</label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="z.B. vip, b2b, partner"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Notizen</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="ERP-Notizen (z.B. Ansprechpartner, Besonderheiten, Konditionen …)"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-xl border border-slate-200 bg-transparent px-4 py-2 text-sm hover:bg-slate-100"
                >
                  Schliessen
                </button>
                <button
                  type="submit"
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
                >
                  Speichern
                </button>
              </div>
            </form>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium">Belege</div>
              <div className="text-xs text-slate-500">Rechnungen und Gutschriften für diesen Kunden.</div>
              {docsErr ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {docsErr}
                </div>
              ) : docsLoading ? (
                <div className="mt-3 text-xs text-slate-500">Lade…</div>
              ) : customerDocs.length === 0 ? (
                <div className="mt-3 text-xs text-slate-500">Keine Belege.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {customerDocs.map((d) => {
                    const isCredit = d.document_type === "credit_note";
                    const docNo = isCredit ? d.credit_note_no : d.invoice_no;
                    const docDate = isCredit ? d.credit_note_date : d.invoice_date;
                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="font-medium">{docNo || "—"}</div>
                          <div className="text-slate-500">
                            {isCredit ? "Gutschrift" : "Rechnung"} ·{" "}
                            {docDate ? new Date(docDate).toLocaleDateString("de-CH") : "—"}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-slate-700">{formatCHF(d.gross_total)}</div>
                          <button
                            onClick={() => openOrderFromCustomer(d.id)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            Auftrag öffnen
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium">KI-Idee (nächster Sprint)</div>
              <div className="text-sm text-slate-700 mt-1">
                „Schlage Tags vor“, „Formuliere Notizen sauber“, „Erkenne Risiken/Dubletten“ – direkt hier im Drawer.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
