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
      : tone === "bad"
      ? "border-red-400/20 bg-red-500/10 text-red-200"
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

// ✅ FIX: Leere Tags -> [] statt null (damit NOT NULL in DB nicht verletzt wird)
function parseTags(input) {
  const raw = String(input || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return raw; // immer Array zurückgeben (auch wenn leer)
}

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
}

export default function Items() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active | archived | all
  const [err, setErr] = useState("");

  // Drawer
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // item object or null for new

  // Draft fields
  const [itemNo, setItemNo] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [price, setPrice] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active"); // active/archived

  // Movements
  const [movements, setMovements] = useState([]);
  const [mvQty, setMvQty] = useState("1");
  const [mvReason, setMvReason] = useState("");
  const [mvPosting, setMvPosting] = useState(false);
  const mvPostingRef = useRef(false);

  async function load() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("items")
      .select("id, item_no, name, category, unit, current_stock, price, status, tags, notes, created_at")
      .order("created_at", { ascending: false });

    if (error) setErr(prettySupabaseError(error));
    setItems(data || []);
    setLoading(false);
  }

  async function loadMovements(itemId) {
    if (!itemId) {
      setMovements([]);
      return;
    }

    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, created_at, movement_type, qty, unit, reason, reference, notes, order_id, order_line_id, created_by"
      )
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) setErr(prettySupabaseError(error));
    setMovements(data || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return items.filter((it) => {
      const st = it.status || "active";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!s) return true;

      const tagStr = Array.isArray(it.tags) ? it.tags.join(", ") : String(it.tags || "");
      return (
        (it.item_no || "").toLowerCase().includes(s) ||
        (it.name || "").toLowerCase().includes(s) ||
        (it.category || "").toLowerCase().includes(s) ||
        (it.unit || "").toLowerCase().includes(s) ||
        tagStr.toLowerCase().includes(s)
      );
    });
  }, [items, q, statusFilter]);

  const activeCount = items.filter((i) => (i.status || "active") === "active").length;
  const archivedCount = items.filter((i) => (i.status || "active") === "archived").length;

  function openNew() {
    setEditing(null);
    setItemNo("");
    setName("");
    setCategory("");
    setUnit("pcs");
    setPrice("");
    setTags("");
    setNotes("");
    setStatus("active");
    setMovements([]);
    setMvQty("1");
    setMvReason("");
    setOpen(true);
  }

  function openEdit(it) {
    setEditing(it);
    setItemNo(it.item_no || "");
    setName(it.name || "");
    setCategory(it.category || "");
    setUnit(it.unit || "pcs");
    setPrice(it.price ?? "");
    setTags(Array.isArray(it.tags) ? it.tags.join(", ") : String(it.tags || ""));
    setNotes(it.notes || "");
    setStatus(it.status || "active");
    setMvQty("1");
    setMvReason("");
    setOpen(true);
    loadMovements(it.id);
  }

  async function saveItem(e) {
    e.preventDefault();
    setErr("");

    const no = itemNo.trim();
    const nm = name.trim();

    if (!no) return setErr("Artikelnummer fehlt.");
    if (!nm) return setErr("Name fehlt.");

    // simple soft duplicate checks
    const dupNo = items.find((x) => x.id !== editing?.id && norm(x.item_no) === norm(no));
    if (dupNo) {
      const ok = confirm(`Artikelnummer "${dupNo.item_no}" existiert bereits. Trotzdem speichern?`);
      if (!ok) return;
    }

    const parsedTags = parseTags(tags); // immer Array
    const payload = {
      item_no: no,
      name: nm,
      category: category.trim() || null,
      unit: unit.trim() || "pcs",
      price: price === "" ? null : Number(price),
      tags: parsedTags, // ✅ jetzt nie null
      notes: notes.trim() || null,
      status: status || "active",
    };

    if (!editing) {
      const { error } = await supabase.from("items").insert(payload);
      if (error) return setErr(prettySupabaseError(error));
    } else {
      const { error } = await supabase.from("items").update(payload).eq("id", editing.id);
      if (error) return setErr(prettySupabaseError(error));
    }

    await load();

    if (editing) {
      const updated = (items || []).find((x) => x.id === editing.id) || null;
      setEditing(updated);
      await loadMovements(editing.id);
    } else {
      setOpen(false);
    }
  }

  async function setArchived(id, archived) {
    setErr("");
    const { error } = await supabase
      .from("items")
      .update({ status: archived ? "archived" : "active" })
      .eq("id", id);

    if (error) setErr(prettySupabaseError(error));
    await load();
  }

  async function hardDelete(id) {
    const ok = confirm("Hard-Delete wirklich? (ERP-Standard wäre archivieren)");
    if (!ok) return;
    setErr("");
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) setErr(prettySupabaseError(error));
    await load();
  }

  async function postMovement(type) {
    if (mvPostingRef.current) return;
    if (!editing?.id) {
      setErr("Bitte zuerst einen Artikel öffnen/bearbeiten.");
      return;
    }

    setErr("");
    const qty = Number(mvQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr("Menge muss > 0 sein.");
      return;
    }

    mvPostingRef.current = true;
    setMvPosting(true);

    const reason =
      (mvReason || "").trim() ||
      (type === "in" ? "Wareneingang" : type === "out" ? "Warenausgang" : "Inventur");

    const { error } = await supabase.from("stock_movements").insert({
      item_id: editing.id,
      movement_type: type,
      qty,
      unit: (unit || editing.unit || "pcs").trim() || "pcs",
      reason,
    });

    setMvPosting(false);
    mvPostingRef.current = false;

    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }

    await load();

    const fresh = await supabase
      .from("items")
      .select("id, item_no, name, category, unit, current_stock, price, status, tags, notes, created_at")
      .eq("id", editing.id)
      .single();

    if (!fresh.error && fresh.data) setEditing(fresh.data);

    await loadMovements(editing.id);
    setMvReason("");
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      {/* LEFT: module */}
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Artikel</h1>
            <p className="text-sm text-slate-400">
              Liste, Suche, Neu, Archivieren, Bearbeiten – ERP-Style.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="ok">{activeCount} aktiv</Badge>
              <Badge tone="warn">{archivedCount} archiviert</Badge>
            </div>
          </div>

          <button
            onClick={openNew}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            + Neuer Artikel
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen (Nr, Name, Kategorie, Unit, Tags)…"
            className="w-full md:w-[520px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
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
          <div className="grid grid-cols-[140px_1.2fr_0.9fr_140px_160px_auto] gap-0 bg-white/5 px-4 py-3 text-xs text-slate-300">
            <div>Nr</div>
            <div>Name</div>
            <div>Kategorie</div>
            <div>Bestand</div>
            <div>Preis</div>
            <div className="text-right">Aktion</div>
          </div>

          <div className="divide-y divide-white/10">
            {loading ? (
              <div className="px-4 py-4 text-sm text-slate-400">Lade Daten…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400">Keine Artikel gefunden.</div>
            ) : (
              filtered.map((it) => {
                const st = it.status || "active";
                return (
                  <div
                    key={it.id}
                    className="grid grid-cols-[140px_1.2fr_0.9fr_140px_160px_auto] gap-0 px-4 py-3 text-sm items-center"
                  >
                    <div className="text-slate-200 truncate">{it.item_no}</div>

                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => openEdit(it)}
                        className="font-medium truncate text-left hover:underline"
                        title="Bearbeiten"
                      >
                        {it.name}
                      </button>
                      {st === "archived" && <Badge tone="warn">archiviert</Badge>}
                    </div>

                    <div className="text-slate-300 truncate">{it.category || "—"}</div>

                    <div className="text-slate-300 truncate">
                      {Number(it.current_stock || 0)} {it.unit || "pcs"}
                    </div>

                    <div className="text-slate-300 truncate">{formatCHF(it.price)}</div>

                    <div className="text-right flex items-center justify-end gap-2">
                      {st === "active" ? (
                        <button
                          onClick={() => setArchived(it.id, true)}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                        >
                          Archivieren
                        </button>
                      ) : (
                        <button
                          onClick={() => setArchived(it.id, false)}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                        >
                          Reaktivieren
                        </button>
                      )}
                      <button
                        onClick={() => hardDelete(it.id)}
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

      {/* RIGHT: KI panel placeholder */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 h-fit sticky top-[72px]">
        <div className="flex items-center justify-between">
          <div className="font-semibold">KI-Assistent</div>
          <Badge tone="ok">bereit</Badge>
        </div>

        <div className="mt-2 text-sm text-slate-300">
          Nächster Sprint: Kategorien vorschlagen, Einheit erkennen, Dubletten (Name/Nr),
          Preis plausibilisieren, Pflichtfelder markieren.
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
            <div className="text-xs text-slate-400">ERP-Tipp</div>
            <div className="mt-1 text-slate-200">
              Artikelnummern sind Gold: konsistent, kurz, eindeutig.
            </div>
          </div>
        </div>
      </div>

      {/* Drawer / Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60">
          <div className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-white/10 bg-slate-950 p-5 overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">
                  {editing ? "Artikel bearbeiten" : "Neuer Artikel"}
                </div>
                <div className="text-sm text-slate-400">
                  Bestand kommt aus Bewegungen (Wareneingang/-ausgang/Inventur).
                </div>
                {editing && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={(editing.status || "active") === "active" ? "ok" : "warn"}>
                      {(editing.status || "active") === "active" ? "aktiv" : "archiviert"}
                    </Badge>
                    <Badge>
                      Bestand: {Number(editing.current_stock || 0)} {editing.unit || unit || "pcs"}
                    </Badge>
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveItem} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Artikelnummer *</label>
                  <input
                    value={itemNo}
                    onChange={(e) => setItemNo(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="z. B. BO-0001"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  >
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  placeholder="z. B. Office Comfort"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kategorie</label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="z. B. Elektronik"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Einheit (unit)</label>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="pcs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Preis (CHF)</label>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                    placeholder="120.00"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bestand (read-only)</label>
                  <input
                    value={editing ? String(Number(editing.current_stock || 0)) : "0"}
                    disabled
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm opacity-70 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Tags (Komma-separiert)</label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  placeholder="z. B. vip, b2b, partner"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Notizen</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full min-h-[110px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/20"
                  placeholder="ERP-Notizen (z.B. Besonderheiten, Konditionen …)"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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

            {/* Movements */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Bestandsbewegungen</div>
                <Badge>Trigger aktualisiert current_stock</Badge>
              </div>

              {!editing ? (
                <div className="mt-2 text-sm text-slate-400">
                  Speichere zuerst den Artikel, dann kannst du Bewegungen buchen.
                </div>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr]">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Menge</label>
                      <input
                        value={mvQty}
                        onChange={(e) => setMvQty(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm outline-none focus:border-white/20"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Grund (optional)</label>
                      <input
                        value={mvReason}
                        onChange={(e) => setMvReason(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm outline-none focus:border-white/20"
                        placeholder="z.B. Lieferung, Verkauf, Inventur …"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={mvPosting}
                      onClick={() => postMovement("in")}
                      className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-60"
                      title="Wareneingang"
                    >
                      + Wareneingang
                    </button>
                    <button
                      disabled={mvPosting}
                      onClick={() => postMovement("out")}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
                      title="Warenausgang"
                    >
                      − Warenausgang
                    </button>
                    <button
                      disabled={mvPosting}
                      onClick={() => postMovement("inventory")}
                      className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/15 disabled:opacity-60"
                      title="Inventur setzt Bestand exakt auf Menge"
                    >
                      Inventur setzen
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-400 mb-2">Letzte Bewegungen (max. 20)</div>

                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <div className="grid grid-cols-[160px_110px_1fr] bg-white/5 px-3 py-2 text-xs text-slate-300">
                        <div>Datum</div>
                        <div>Typ / Ref</div>
                        <div>Info</div>
                      </div>
                      <div className="divide-y divide-white/10">
                        {movements.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-slate-400">Noch keine Bewegungen.</div>
                        ) : (
                          movements.map((m) => (
                            <div
                              key={m.id}
                              className="grid grid-cols-[160px_110px_1fr] px-3 py-2 text-sm"
                            >
                              <div className="text-slate-300">
                                {new Date(m.created_at).toLocaleString("de-CH")}
                              </div>

                              <div className="space-y-1">
                                <div>
                                  {m.movement_type === "in" && <Badge tone="ok">in</Badge>}
                                  {m.movement_type === "out" && <Badge tone="bad">out</Badge>}
                                  {m.movement_type === "inventory" && <Badge tone="warn">inv</Badge>}
                                  {m.movement_type === "adjust" && <Badge>adj</Badge>}
                                </div>

                                {m.reference ? (
                                  <div
                                    className="text-[11px] text-slate-400 font-mono truncate"
                                    title={m.reference}
                                  >
                                    ref: {m.reference}
                                  </div>
                                ) : null}
                              </div>

                              <div className="text-slate-200">
                                <div>
                                  {Number(m.qty)} {m.unit || unit || "pcs"}
                                  {m.reason ? (
                                    <span className="text-slate-400"> — {m.reason}</span>
                                  ) : null}
                                </div>

                                {m.notes ? (
                                  <div className="mt-1 text-[12px] text-slate-300">
                                    <span className="text-slate-400">Notiz:</span> {m.notes}
                                  </div>
                                ) : null}

                                {(m.order_id || m.order_line_id) ? (
                                  <div className="mt-1 text-[11px] text-slate-500 font-mono">
                                    {m.order_id ? <>order: {m.order_id}</> : null}
                                    {m.order_line_id ? (
                                      <> {m.order_id ? " | " : ""}line: {m.order_line_id}</>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      ERP-Logik: Bestand entsteht aus Bewegungen. Du kannst später Ausgänge automatisch aus
                      Aufträgen erzeugen.
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <div className="text-xs text-slate-400">KI-Idee (nächster Sprint)</div>
              <div className="mt-1 text-sm text-slate-200">
                „Vorschlagen: Kategorie/Tags“, „Warnen: Dubletten“, „Preis plausibilisieren“, „Fehlende
                Pflichtfelder markieren“ – direkt hier im Drawer.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
