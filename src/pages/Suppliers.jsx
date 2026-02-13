import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
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

export default function Suppliers() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [err, setErr] = useState("");

  // Create modal
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("CH");
  const [vatUid, setVatUid] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editCompany, setEditCompany] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editStreet2, setEditStreet2] = useState("");
  const [editZip, setEditZip] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editCountry, setEditCountry] = useState("CH");
  const [editVatUid, setEditVatUid] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [supplierItems, setSupplierItems] = useState([]);
  const [siItemId, setSiItemId] = useState("");
  const [siPrice, setSiPrice] = useState("");
  const [siItemNo, setSiItemNo] = useState("");
  const [siEditingId, setSiEditingId] = useState(null);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");

    const [{ data, error }, { data: itemRows, error: itemErr }] = await Promise.all([
      supabase
        .from("suppliers")
        .select(
          "id, company_name, contact_name, email, phone, street, street2, zip, city, country, vat_uid, notes, tags, status, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("items")
        .select("id, name, status, purchase_price")
        .eq("status", "active")
        .order("name", { ascending: true }),
    ]);

    if (error) setErr(prettySupabaseError(error));
    if (itemErr) setErr(prettySupabaseError(itemErr));
    setSuppliers(data || []);
    setItems(itemRows || []);
    setLoading(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  const loadSupplierItems = useCallback(async (supplierId) => {
    if (!supplierId) return;
    const { data, error } = await supabase
      .from("supplier_items")
      .select("id, supplier_id, item_id, purchase_price, currency, supplier_item_no")
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false });
    if (error) return setErr(prettySupabaseError(error));
    setSupplierItems(data || []);
  }, []);

  const openDrawer = useCallback(
    (c) => {
      setSelected(c);
      setEditCompany(c.company_name || "");
      setEditContact(c.contact_name || "");
      setEditEmail(c.email || "");
      setEditPhone(c.phone || "");
      setEditStreet(c.street || "");
      setEditStreet2(c.street2 || "");
      setEditZip(c.zip || "");
      setEditCity(c.city || "");
      setEditCountry(c.country || "CH");
      setEditVatUid(c.vat_uid || "");
      setEditTags(tagsToString(c.tags));
      setEditNotes(c.notes || "");
      setEditStatus(c.status || "active");
      setSupplierItems([]);
      setSiItemId("");
      setSiPrice("");
      setSiItemNo("");
      setSiEditingId(null);
      setDrawerOpen(true);
      loadSupplierItems(c.id);
    },
    [loadSupplierItems]
  );

  useEffect(() => {
    if (deepLinkHandled || suppliers.length === 0) return;
    const raw = localStorage.getItem("deepLink");
    if (!raw) return;
    try {
      const dl = JSON.parse(raw);
      if (dl.module === "suppliers" && dl.id) {
        const s = suppliers.find((x) => x.id === dl.id);
        if (s) {
          queueMicrotask(() => {
            openDrawer(s);
          });
          localStorage.removeItem("deepLink");
          queueMicrotask(() => {
            setDeepLinkHandled(true);
          });
        }
      }
    } catch {
      localStorage.removeItem("deepLink");
    }
  }, [suppliers, deepLinkHandled, openDrawer]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return suppliers.filter((c) => {
      const st = c.status || "active";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!s) return true;
      const tagStr = tagsToString(c.tags).toLowerCase();
      return (
        (c.company_name || "").toLowerCase().includes(s) ||
        (c.contact_name || "").toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s) ||
        (c.phone || "").toLowerCase().includes(s) ||
        tagStr.includes(s)
      );
    });
  }, [suppliers, q, statusFilter]);

  async function createSupplier(e) {
    e.preventDefault();
    setErr("");

    const name = companyName.trim();
    if (!name) return setErr("Firmenname fehlt.");

    const payload = {
      company_name: name,
      contact_name: contactName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      street: street.trim() || null,
      street2: street2.trim() || null,
      zip: zip.trim() || null,
      city: city.trim() || null,
      country: country.trim() || "CH",
      vat_uid: vatUid.trim() || null,
      tags: parseTags(tags),
      notes: notes.trim() || null,
      status: "active",
    };

    const { error } = await supabase.from("suppliers").insert(payload);
    if (error) return setErr(prettySupabaseError(error));

    setCompanyName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setStreet("");
    setStreet2("");
    setZip("");
    setCity("");
    setCountry("CH");
    setVatUid("");
    setTags("");
    setNotes("");
    setOpen(false);
    await load();
  }

  async function setArchived(id, archived) {
    setErr("");
    const { error } = await supabase
      .from("suppliers")
      .update({ status: archived ? "archived" : "active" })
      .eq("id", id);

    if (error) setErr(prettySupabaseError(error));
    await load();
  }

  async function hardDelete(id) {
    const ok = confirm("Hard-Delete wirklich? (ERP-Standard wäre archivieren)");
    if (!ok) return;
    setErr("");
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) setErr(prettySupabaseError(error));
    await load();
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelected(null);
  }

  async function saveSupplierEdits(e) {
    e.preventDefault();
    if (!selected) return;

    setErr("");

    const payload = {
      company_name: editCompany.trim(),
      contact_name: editContact.trim() || null,
      email: editEmail.trim() || null,
      phone: editPhone.trim() || null,
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

    if (!payload.company_name) return setErr("Firmenname fehlt.");

    const { error } = await supabase.from("suppliers").update(payload).eq("id", selected.id);
    if (error) return setErr(prettySupabaseError(error));

    setDrawerOpen(false);
    setSelected(null);
    await load();
  }

  async function addSupplierItemPrice(e) {
    e.preventDefault();
    if (!selected) return;
    setErr("");

    const price = Number(siPrice);
    if (!siItemId) return setErr("Bitte Artikel wählen.");
    if (!Number.isFinite(price) || price <= 0) return setErr("Preis muss > 0 sein.");

    const payload = {
      supplier_id: selected.id,
      item_id: siItemId,
      purchase_price: price,
      currency: "CHF",
      supplier_item_no: siItemNo.trim() || null,
    };

    const { error } = siEditingId
      ? await supabase.from("supplier_items").update(payload).eq("id", siEditingId)
      : await supabase.from("supplier_items").upsert(payload, {
          onConflict: "supplier_id,item_id",
        });

    if (error) return setErr(prettySupabaseError(error));

    setSiItemId("");
    setSiPrice("");
    setSiItemNo("");
    setSiEditingId(null);
    await loadSupplierItems(selected.id);
  }

  async function deleteSupplierItem(id) {
    const ok = confirm("Preiszeile löschen?");
    if (!ok) return;
    setErr("");
    const { error } = await supabase.from("supplier_items").delete().eq("id", id);
    if (error) return setErr(prettySupabaseError(error));
    await loadSupplierItems(selected.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Lieferanten</h1>
          <p className="text-sm text-slate-500">Lieferanten verwalten, Adressen & MWST‑UID pflegen.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
        >
          Neuer Lieferant
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full md:w-[420px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
            placeholder="Suche nach Name, Kontakt, Email, Tags…"
          />
          <div className="ml-auto flex gap-2">
            {[
              { key: "active", label: "Aktiv" },
              { key: "archived", label: "Archiv" },
              { key: "all", label: "Alle" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  statusFilter === f.key
                    ? "border-slate-300 bg-slate-100"
                    : "border-slate-200 bg-transparent hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] bg-slate-100 px-4 py-3 text-xs text-slate-700">
          <div>Firma</div>
          <div>Kontakt</div>
          <div>Email</div>
          <div className="text-right">Aktion</div>
        </div>
        <div className="divide-y divide-slate-200">
          {loading ? (
            <div className="px-4 py-4 text-sm text-slate-500">Lade…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">Keine Lieferanten gefunden.</div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-[1.4fr_1fr_1fr_auto] px-4 py-3 text-sm items-center hover:bg-slate-50 cursor-pointer"
                onClick={() => openDrawer(c)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="font-medium truncate">{c.company_name}</div>
                  {c.status === "archived" && <Badge tone="warn">archiviert</Badge>}
                </div>
                <div className="text-slate-700 truncate">{c.contact_name || "—"}</div>
                <div className="text-slate-700 truncate">{c.email || "—"}</div>
                <div
                  className="text-right flex items-center justify-end gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.status === "active" ? (
                    <button
                      onClick={() => setArchived(c.id, true)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                    >
                      Archivieren
                    </button>
                  ) : (
                    <button
                      onClick={() => setArchived(c.id, false)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                    >
                      Reaktivieren
                    </button>
                  )}
                  <button
                    onClick={() => hardDelete(c.id)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Neuer Lieferant</div>
                <div className="text-sm text-slate-500">Adresse & MWST‑UID pflegen.</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={createSupplier} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Firmenname *</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="Lieferant AG"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Kontakt</label>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Telefon</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
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
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Strasse</label>
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Adresszusatz</label>
                  <input
                    value={street2}
                    onChange={(e) => setStreet2(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
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
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Ort</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Land</label>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Tags</label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="z.B. Holz, Metall, Services"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Notizen</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
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
          </div>
        </div>
      )}

      {drawerOpen && selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-slate-200 bg-slate-50 p-5 overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Lieferant bearbeiten</div>
                <div className="text-sm text-slate-500">{selected.company_name}</div>
              </div>
              <button
                onClick={closeDrawer}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveSupplierEdits} className="mt-4 space-y-3">
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
                  <label className="block text-xs text-slate-500 mb-1">Telefon</label>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">MWST‑UID</label>
                  <input
                    value={editVatUid}
                    onChange={(e) => setEditVatUid(e.target.value)}
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
                <label className="block text-xs text-slate-500 mb-1">Tags</label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Notizen</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={6}
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
                    >
                      Archivieren
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditStatus("active")}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                    >
                      Reaktivieren
                    </button>
                  )}
                </div>
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

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Artikel & Einkaufspreise</div>
                <Badge>Lieferantenpreise</Badge>
              </div>

              <form onSubmit={addSupplierItemPrice} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1.6fr_140px_140px_auto]">
                <select
                  value={siItemId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSiItemId(next);
                    const it = items.find((x) => x.id === next);
                    if (it?.purchase_price !== undefined && it?.purchase_price !== null) {
                      setSiPrice(String(it.purchase_price));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                >
                  <option value="">— Artikel wählen —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
                <input
                  value={siPrice}
                  onChange={(e) => setSiPrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  placeholder="Preis CHF"
                  inputMode="decimal"
                />
                <input
                  value={siItemNo}
                  onChange={(e) => setSiItemNo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                  placeholder="Lieferant Artikel-Nr."
                />
                <button
                  type="submit"
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200"
                >
                  {siEditingId ? "Aktualisieren" : "Speichern"}
                </button>
                {siEditingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSiEditingId(null);
                      setSiItemId("");
                      setSiPrice("");
                      setSiItemNo("");
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    Abbrechen
                  </button>
                )}
              </form>

              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[1.6fr_140px_140px_auto] bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div>Artikel</div>
                  <div>Preis</div>
                  <div>Lieferant-Nr.</div>
                  <div className="text-right">Aktion</div>
                </div>
                <div className="divide-y divide-slate-200">
                  {supplierItems.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">Noch keine Preise erfasst.</div>
                  ) : (
                    supplierItems.map((si) => (
                      <div key={si.id} className="grid grid-cols-[1.6fr_140px_140px_auto] px-3 py-2 text-sm">
                        <div className="text-slate-800">
                          {items.find((x) => x.id === si.item_id)?.name || "Artikel"}
                        </div>
                        <div className="text-slate-700">{formatCHF(si.purchase_price)}</div>
                        <div className="text-slate-700">{si.supplier_item_no || "—"}</div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSiEditingId(si.id);
                              setSiItemId(si.item_id);
                              setSiPrice(String(si.purchase_price));
                              setSiItemNo(si.supplier_item_no || "");
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => deleteSupplierItem(si.id)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
                          >
                            Löschen
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
