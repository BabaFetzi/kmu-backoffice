import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { buildReorderSuggestions } from "../lib/replenishment";

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
      : tone === "bad"
      ? "border-red-200 bg-red-50 text-red-700"
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

const REORDER_LOOKBACK_DAYS = 30;
const REORDER_LEAD_TIME_DAYS = 14;
const REORDER_SAFETY_DAYS = 7;
const REORDER_MAX_ROWS = 8;

function reorderUrgencyTone(level) {
  if (level === "critical") return "bad";
  if (level === "high") return "warn";
  if (level === "medium") return "default";
  return "ok";
}

function reorderUrgencyLabel(level) {
  if (level === "critical") return "kritisch";
  if (level === "high") return "hoch";
  if (level === "medium") return "mittel";
  return "ok";
}

function formatQty(value, unit) {
  const n = Number(value || 0);
  const normalizedUnit = String(unit || "").toLowerCase();
  const isDiscrete =
    normalizedUnit === "pcs" ||
    normalizedUnit === "stk" ||
    normalizedUnit === "stk." ||
    normalizedUnit === "piece" ||
    normalizedUnit === "pieces" ||
    normalizedUnit === "unit" ||
    normalizedUnit === "stueck" ||
    normalizedUnit === "stück";
  return n.toLocaleString("de-CH", {
    minimumFractionDigits: isDiscrete ? 0 : 2,
    maximumFractionDigits: isDiscrete ? 0 : 2,
  });
}

export default function Items() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active | archived | all
  const [missingSupplierOnly, setMissingSupplierOnly] = useState(false);
  const [missingPriceOnly, setMissingPriceOnly] = useState(false);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [err, setErr] = useState("");
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderRows, setReorderRows] = useState([]);
  const [reorderErr, setReorderErr] = useState("");
  const [reorderInfo, setReorderInfo] = useState("");
  const [reorderTaskBusyId, setReorderTaskBusyId] = useState("");

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
  const [vatCode, setVatCode] = useState("CH_STD");
  const [vatRates, setVatRates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importErr, setImportErr] = useState("");
  const importFileRef = useRef(null);

  // Movements
  const [movements, setMovements] = useState([]);
  const [mvQty, setMvQty] = useState("1");
  const [mvReason, setMvReason] = useState("");
  const [mvPosting, setMvPosting] = useState(false);
  const mvPostingRef = useRef(false);

  const loadReorderSuggestions = useCallback(async (itemRows) => {
    setReorderErr("");
    setReorderInfo("");
    setReorderLoading(true);

    const activeItems = (itemRows || []).filter((it) => (it.status || "active") === "active");
    if (activeItems.length === 0) {
      setReorderRows([]);
      setReorderLoading(false);
      return;
    }

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - REORDER_LOOKBACK_DAYS);

    const { data: movementRows, error: movementErr } = await supabase
      .from("stock_movements")
      .select("item_id, reason_code, qty, created_at")
      .in("reason_code", ["sale", "return", "cancel"])
      .gte("created_at", since.toISOString());

    if (movementErr) {
      setReorderErr(prettySupabaseError(movementErr));
      setReorderRows([]);
      setReorderLoading(false);
      return;
    }

    const suggestions = buildReorderSuggestions({
      items: activeItems,
      movements: movementRows || [],
      lookbackDays: REORDER_LOOKBACK_DAYS,
      leadTimeDays: REORDER_LEAD_TIME_DAYS,
      safetyDays: REORDER_SAFETY_DAYS,
    }).slice(0, REORDER_MAX_ROWS);

    setReorderRows(suggestions);
    setReorderLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("items")
      .select(
        "id, item_no, name, category, unit, current_stock, price, purchase_price, search_term, technical_name, color, weight, weight_unit, status, tags, notes, created_at, vat_code, supplier_id, supplier:suppliers ( id, company_name )"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErr(prettySupabaseError(error));
      setItems([]);
      setReorderRows([]);
      setLoading(false);
      return;
    }

    const rows = data || [];
    setItems(rows);
    await loadReorderSuggestions(rows);
    setLoading(false);
  }, [loadReorderSuggestions]);

  const loadMovements = useCallback(async (itemId) => {
    if (!itemId) {
      setMovements([]);
      return;
    }

    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, created_at, movement_type, qty, unit, reason_code, qty_change, reason, reference, notes, order_id, order_line_id, created_by"
      )
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) setErr(prettySupabaseError(error));
    setMovements(data || []);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    async function loadVatRates() {
      const { data, error } = await supabase
        .from("vat_rates")
        .select("code, name, rate")
        .order("rate", { ascending: false });
      if (!error) setVatRates(data || []);
    }
    loadVatRates();
  }, []);

  useEffect(() => {
    async function loadSuppliers() {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, company_name, status")
        .order("company_name", { ascending: true });
      if (!error) setSuppliers((data || []).filter((s) => (s.status || "active") === "active"));
    }
    loadSuppliers();
  }, []);

  const openEdit = useCallback(
    (it) => {
      setEditing(it);
      setItemNo(it.item_no || "");
      setName(it.name || "");
      setCategory(it.category || "");
      setUnit(it.unit || "pcs");
      setPrice(it.price ?? "");
      setVatCode(it.vat_code || "CH_STD");
      setSupplierId(it.supplier_id || "");
      setPurchasePrice(it.purchase_price ?? "");
      setTags(Array.isArray(it.tags) ? it.tags.join(", ") : String(it.tags || ""));
      setNotes(it.notes || "");
      setStatus(it.status || "active");
      setMvQty("1");
      setMvReason("");
      setOpen(true);
      loadMovements(it.id);
    },
    [loadMovements]
  );

  useEffect(() => {
    if (deepLinkHandled || items.length === 0) return;
    const raw = localStorage.getItem("deepLink");
    if (!raw) return;
    try {
      const dl = JSON.parse(raw);
      if (dl.module === "items" && dl.id) {
        const it = items.find((x) => x.id === dl.id);
        if (it) {
          queueMicrotask(() => {
            openEdit(it);
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
  }, [items, deepLinkHandled, openEdit]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return items.filter((it) => {
      const st = it.status || "active";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (missingSupplierOnly && !it.supplier_id) return false;
      if (missingPriceOnly && (Number(it.price || 0) > 0 || Number(it.purchase_price || 0) > 0)) return false;
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
  }, [items, q, statusFilter, missingSupplierOnly, missingPriceOnly]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (it) => {
      if (sortKey === "name") return String(it.name || "").toLowerCase();
      if (sortKey === "stock") return Number(it.current_stock || 0);
      if (sortKey === "purchase") return Number(it.purchase_price || 0);
      if (sortKey === "sales") return Number(it.price || 0);
      if (sortKey === "supplier") return String(it.supplier?.company_name || "").toLowerCase();
      return String(it.item_no || "").toLowerCase();
    };
    return [...filtered].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const activeCount = items.filter((i) => (i.status || "active") === "active").length;
  const archivedCount = items.filter((i) => (i.status || "active") === "archived").length;

  function openNew() {
    setEditing(null);
    setItemNo("");
    setName("");
    setCategory("");
    setUnit("pcs");
    setPrice("");
    setVatCode("CH_STD");
    setSupplierId("");
    setPurchasePrice("");
    setTags("");
    setNotes("");
    setStatus("active");
    setMovements([]);
    setMvQty("1");
    setMvReason("");
    setOpen(true);
  }

  function normalizeHeader(h) {
    return String(h || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function pick(normalized, keys, prefixes = []) {
    for (const k of keys) {
      if (normalized[k] !== undefined && normalized[k] !== null && normalized[k] !== "") return normalized[k];
    }
    for (const p of prefixes) {
      const foundKey = Object.keys(normalized).find((k) => k.startsWith(p) || k.includes(p));
      if (foundKey && normalized[foundKey] !== undefined && normalized[foundKey] !== null && normalized[foundKey] !== "")
        return normalized[foundKey];
    }
    return "";
  }

  function parseNumber(value) {
    if (value === null || value === undefined) return null;
    const s = String(value)
      .replace(/[^0-9,.-]/g, "")
      .replace(",", ".")
      .trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function parseStatus(value) {
    const s = String(value || "").trim().toLowerCase();
    if (!s) return "active";
    if (["aktiv", "active", "1", "true", "ja", "yes"].includes(s)) return "active";
    if (["inaktiv", "inactive", "0", "false", "nein", "no"].includes(s)) return "archived";
    return "active";
  }

  async function handleImportFile(file) {
    setImportErr("");
    setImportPreview([]);
    setImportSummary(null);
    if (!file) return;
    setImportFileName(file.name || "");
    setImportFile(file);
    try {
      const { default: readXlsxFile } = await import("read-excel-file");
      const table = await readXlsxFile(file);
      if (!table.length) {
        setImportErr("Leere Excel-Datei.");
        return;
      }
      const headers = (table[0] || []).map((h) => String(h ?? "").trim());
      const rows = table
        .slice(1)
        .map((row) => {
          const out = {};
          let hasValue = false;
          headers.forEach((key, idx) => {
            if (!key) return;
            const value = String(row?.[idx] ?? "");
            if (value.trim() !== "") hasValue = true;
            out[key] = value;
          });
          return hasValue ? out : null;
        })
        .filter(Boolean);
      const mapped = rows.map((row) => {
        const normalized = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [normalizeHeader(k), v])
        );
        const itemNo = pick(
          normalized,
          ["produktnr", "produktno", "produktnummer", "artikelnr", "artnr", "productno", "itemno", "produktenr"],
          ["produktnr", "artikel", "artnr", "itemno", "productno", "produktenr"]
        );

        const searchTerm = pick(normalized, ["suchbegriff", "searchterm"], ["such", "search"]);
        const technicalName = pick(
          normalized,
          ["technischebezeichnung", "technicalname", "bezeichnung"],
          ["technisch", "technical", "bezeichnung"]
        );
        const color = pick(normalized, ["farbe", "color"], ["farbe", "color"]);
        const weight = parseNumber(pick(normalized, ["gewicht", "weight"], ["gewicht", "weight"]));
        const status = parseStatus(pick(normalized, ["aktivinaktiv", "aktiv", "status"], ["aktiv", "status"]));
        const purchasePrice = parseNumber(pick(normalized, ["einkaufspreis", "purchaseprice"], ["einkauf", "purchase"]));
        const salesPrice = parseNumber(pick(normalized, ["verkaufspreis", "salesprice"], ["verkauf", "sale"]));

        const name = String(technicalName || searchTerm || itemNo || "").trim();

        return {
          item_no: String(itemNo || "").trim(),
          name,
          search_term: String(searchTerm || "").trim() || null,
          technical_name: String(technicalName || "").trim() || null,
          color: String(color || "").trim() || null,
          weight: weight,
          weight_unit: "kg",
          status,
          purchase_price: purchasePrice,
          price: salesPrice,
        };
      });

      setImportPreview(mapped.slice(0, 5));

      const valid = mapped.filter((r) => r.item_no && r.name);
      const missing = mapped.length - valid.length;
      setImportSummary({ total: mapped.length, valid: valid.length, missing });
      return valid;
    } catch (e) {
      setImportErr(e?.message || String(e));
      return [];
    }
  }

  async function runImport(file) {
    if (!file) return;
    setImportLoading(true);
    setImportErr("");
    const valid = await handleImportFile(file);
    if (!valid || valid.length === 0) {
      setImportLoading(false);
      return;
    }

    const byNo = new Map(items.map((i) => [String(i.item_no || "").trim().toLowerCase(), i]));
    let updated = 0;
    let inserted = 0;

    for (const row of valid) {
      const key = String(row.item_no || "").trim().toLowerCase();
      const existing = byNo.get(key);
      if (existing) {
        const { error } = await supabase.from("items").update(row).eq("id", existing.id);
        if (!error) updated += 1;
      } else {
        const { error } = await supabase.from("items").insert(row);
        if (!error) inserted += 1;
      }
    }

    setImportSummary((prev) => ({ ...prev, updated, inserted }));
    await load();
    setImportLoading(false);
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
      purchase_price: purchasePrice === "" ? null : Number(purchasePrice),
      vat_code: vatCode || "CH_STD",
      supplier_id: supplierId || null,
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

    const note =
      (mvReason || "").trim() ||
      (type === "in" ? "Wareneingang" : type === "out" ? "Warenausgang" : "Inventur");

    const reasonCode = type === "inventory" ? "inventory" : "correction";

    const { error } = await supabase.from("stock_movements").insert({
      item_id: editing.id,
      movement_type: type,
      qty,
      unit: (unit || editing.unit || "pcs").trim() || "pcs",
      reason_code: reasonCode,
      notes: note,
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
      .select(
        "id, item_no, name, category, unit, current_stock, price, purchase_price, status, tags, notes, created_at, supplier_id, supplier:suppliers ( id, company_name )"
      )
      .eq("id", editing.id)
      .single();

    if (!fresh.error && fresh.data) setEditing(fresh.data);

    await loadMovements(editing.id);
    setMvReason("");
  }

  async function createReorderTask(row) {
    if (!row?.id) return;

    setReorderErr("");
    setReorderInfo("");
    setReorderTaskBusyId(row.id);

    const title = `Nachbestellung empfohlen: ${row.item_no || row.name || "Artikel"}`;
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: existingRows, error: existingErr } = await supabase
      .from("tasks")
      .select("id")
      .eq("item_id", row.id)
      .in("status", ["open", "in_progress"])
      .ilike("title", "Nachbestellung empfohlen:%")
      .limit(1);

    if (existingErr) {
      setReorderErr(prettySupabaseError(existingErr));
      setReorderTaskBusyId("");
      return;
    }

    if ((existingRows || []).length > 0) {
      setReorderInfo(`Für ${row.name} existiert bereits eine offene Nachbestell-Aufgabe.`);
      setReorderTaskBusyId("");
      return;
    }

    const description =
      `Systemvorschlag (${REORDER_LOOKBACK_DAYS} Tage): ` +
      `Bestand ${formatQty(row.current_stock, row.unit)} ${row.unit || "pcs"}, ` +
      `Ø Nachfrage ${formatQty(row.avgDailyDemand, row.unit)} ${row.unit || "pcs"}/Tag, ` +
      `empfohlene Menge ${formatQty(row.reorderQty, row.unit)} ${row.unit || "pcs"}.`;

    const { error } = await supabase.from("tasks").insert({
      title,
      description,
      status: "open",
      due_date: dueDate,
      item_id: row.id,
      supplier_id: row.supplier_id || null,
    });

    if (error) {
      setReorderErr(prettySupabaseError(error));
      setReorderTaskBusyId("");
      return;
    }

    setReorderInfo(`Aufgabe für ${row.name} angelegt.`);
    setReorderTaskBusyId("");
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      {/* LEFT: module */}
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Artikel</h1>
            <p className="text-sm text-slate-500">
              Liste, Suche, Neu, Archivieren, Bearbeiten – ERP-Style.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="ok">{activeCount} aktiv</Badge>
              <Badge tone="warn">{archivedCount} archiviert</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
            >
              Excel Import
            </button>
            <button
              onClick={openNew}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
            >
              + Neuer Artikel
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen (Nr, Name, Kategorie, Unit, Tags)…"
            className="w-full md:w-[520px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
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

          <div className="flex items-center gap-2 md:ml-auto">
            <button
              onClick={() => setMissingSupplierOnly((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-sm ${
                missingSupplierOnly
                  ? "border-slate-300 bg-slate-100"
                  : "border-slate-200 bg-transparent hover:bg-slate-100"
              }`}
            >
              Ohne Lieferant
            </button>
            <button
              onClick={() => setMissingPriceOnly((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-sm ${
                missingPriceOnly
                  ? "border-slate-300 bg-slate-100"
                  : "border-slate-200 bg-transparent hover:bg-slate-100"
              }`}
            >
              Preis fehlt
            </button>
            <div className="text-xs text-slate-500">
              {loading ? "Lade…" : `${sorted.length} Treffer`}
            </div>
          </div>
        </div>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[140px_1.6fr_1fr_0.9fr_120px_120px_120px_200px] gap-0 bg-white px-4 py-3 text-xs text-slate-700">
              <button onClick={() => toggleSort("item_no")} className="text-left">Nr</button>
              <button onClick={() => toggleSort("name")} className="text-left">Name</button>
              <button onClick={() => toggleSort("supplier")} className="text-left">Lieferant</button>
              <div>Kategorie</div>
              <button onClick={() => toggleSort("stock")} className="text-left">Bestand</button>
              <button onClick={() => toggleSort("purchase")} className="text-left">Einkauf</button>
              <button onClick={() => toggleSort("sales")} className="text-left">Verkauf</button>
              <div className="text-right">Aktion</div>
            </div>

            <div className="divide-y divide-slate-200">
              {loading ? (
                <div className="px-4 py-4 text-sm text-slate-500">Lade Daten…</div>
              ) : sorted.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-500">Keine Artikel gefunden.</div>
              ) : (
                sorted.map((it) => {
                  const st = it.status || "active";
                  return (
                    <div
                      key={it.id}
                      className="grid grid-cols-[140px_1.6fr_1fr_0.9fr_120px_120px_120px_200px] gap-0 px-4 py-3 text-sm items-center"
                    >
                      <div className="text-slate-800 truncate">{it.item_no}</div>

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

                      <div className="text-slate-700 truncate">{it.supplier?.company_name || "—"}</div>

                      <div className="text-slate-700 truncate">{it.category || "—"}</div>

                      <div className="text-slate-700 truncate">
                        {Number(it.current_stock || 0)} {it.unit || "pcs"}
                      </div>

                      <div className="text-slate-700 truncate">{formatCHF(it.purchase_price)}</div>

                      <div className="text-slate-700 truncate">{formatCHF(it.price)}</div>

                      <div className="text-right flex items-center justify-end gap-2">
                        {st === "active" ? (
                          <button
                            onClick={() => setArchived(it.id, true)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                          >
                            Archivieren
                          </button>
                        ) : (
                          <button
                            onClick={() => setArchived(it.id, false)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                          >
                            Reaktivieren
                          </button>
                        )}
                        <button
                          onClick={() => hardDelete(it.id)}
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
      </div>

      {/* RIGHT: KI panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 h-fit sticky top-[72px]">
        <div className="flex items-center justify-between">
          <div className="font-semibold">KI-Assistent</div>
          <Badge tone={reorderRows.length > 0 ? "warn" : "ok"}>
            {reorderRows.length > 0 ? "Aktion nötig" : "bereit"}
          </Badge>
        </div>

        <div className="mt-2 text-sm text-slate-700">
          Automatische Nachbestell-Vorschläge auf Basis der letzten {REORDER_LOOKBACK_DAYS} Tage
          (Verkauf minus Retouren/Storno).
        </div>

        {reorderErr && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {reorderErr}
          </div>
        )}
        {reorderInfo && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {reorderInfo}
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-800">Nachbestell-Vorschläge</div>
            <div className="text-xs text-slate-500">Top {REORDER_MAX_ROWS}</div>
          </div>
          <div className="mt-2 space-y-2">
            {reorderLoading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Berechne Vorschläge…
              </div>
            ) : reorderRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Kein akuter Nachbestellbedarf.
              </div>
            ) : (
              reorderRows.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{row.name || "—"}</div>
                      <div className="truncate text-xs text-slate-500">
                        {row.item_no || "ohne Nr."} · {row.unit || "pcs"}
                      </div>
                    </div>
                    <Badge tone={reorderUrgencyTone(row.urgency)}>
                      {reorderUrgencyLabel(row.urgency)}
                    </Badge>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      Bestand:{" "}
                      <span className="font-medium text-slate-900">
                        {formatQty(row.current_stock, row.unit)} {row.unit || "pcs"}
                      </span>
                    </div>
                    <div>
                      Vorschlag:{" "}
                      <span className="font-medium text-slate-900">
                        {formatQty(row.reorderQty, row.unit)} {row.unit || "pcs"}
                      </span>
                    </div>
                    <div>
                      Ø/Tag:{" "}
                      <span className="font-medium text-slate-900">
                        {formatQty(row.avgDailyDemand, row.unit)} {row.unit || "pcs"}
                      </span>
                    </div>
                    <div>
                      Reichweite:{" "}
                      <span className="font-medium text-slate-900">
                        {row.coverageDays === null ? "—" : `${row.coverageDays} Tage`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <button
                      onClick={() => createReorderTask(row)}
                      disabled={reorderTaskBusyId === row.id}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-100 disabled:opacity-60"
                    >
                      {reorderTaskBusyId === row.id ? "Erstelle Aufgabe…" : "Aufgabe anlegen"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
            <div className="text-xs text-slate-500">ERP-Tipp</div>
            <div className="mt-1 text-slate-800">
              Lege je Artikel einen Lieferanten und Einkaufspreis fest, damit Vorschläge schneller in
              echte Bestellungen übergehen.
            </div>
          </div>
        </div>
      </div>

      {/* Drawer / Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60">
          <div className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-slate-200 bg-slate-50 p-5 overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">
                  {editing ? "Artikel bearbeiten" : "Neuer Artikel"}
                </div>
                <div className="text-sm text-slate-500">
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveItem} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Artikelnummer *</label>
                  <input
                    value={itemNo}
                    onChange={(e) => setItemNo(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="z. B. BO-0001"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  >
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="z. B. Office Comfort"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Kategorie</label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="z. B. Elektronik"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">MWST Code</label>
                  <select
                    value={vatCode}
                    onChange={(e) => setVatCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  >
                    {vatRates.length === 0 ? (
                      <option value="CH_STD">CH_STD</option>
                    ) : (
                      vatRates.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.code} • {r.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Lieferant (optional)</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  >
                    <option value="">— kein Lieferant —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.company_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Einheit (unit)</label>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="pcs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Preis (CHF)</label>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="120.00"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Einkaufspreis (CHF)</label>
                  <input
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    placeholder="80.00"
                    inputMode="decimal"
                  />
                </div>
                <div />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Bestand (read-only)</label>
                  <input
                    value={editing ? String(Number(editing.current_stock || 0)) : "0"}
                    disabled
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm opacity-70 cursor-not-allowed"
                  />
                </div>
                <div />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Tags (Komma-separiert)</label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="z. B. vip, b2b, partner"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Notizen</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                  placeholder="ERP-Notizen (z.B. Besonderheiten, Konditionen …)"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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

            {/* Movements */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Bestandsbewegungen</div>
                <Badge>Trigger aktualisiert current_stock</Badge>
              </div>

              {!editing ? (
                <div className="mt-2 text-sm text-slate-500">
                  Speichere zuerst den Artikel, dann kannst du Bewegungen buchen.
                </div>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr]">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Menge</label>
                      <input
                        value={mvQty}
                        onChange={(e) => setMvQty(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-slate-300"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Grund (optional)</label>
                      <input
                        value={mvReason}
                        onChange={(e) => setMvReason(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-slate-300"
                        placeholder="z.B. Lieferung, Verkauf, Inventur …"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={mvPosting}
                      onClick={() => postMovement("in")}
                      className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200 disabled:opacity-60"
                      title="Wareneingang"
                    >
                      + Wareneingang
                    </button>
                    <button
                      disabled={mvPosting}
                      onClick={() => postMovement("out")}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
                      title="Warenausgang"
                    >
                      − Warenausgang
                    </button>
                    <button
                      disabled={mvPosting}
                      onClick={() => postMovement("inventory")}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                      title="Inventur setzt Bestand exakt auf Menge"
                    >
                      Inventur setzen
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-slate-500 mb-2">Letzte Bewegungen (max. 20)</div>

                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="grid grid-cols-[160px_110px_1fr] bg-white px-3 py-2 text-xs text-slate-700">
                        <div>Datum</div>
                        <div>Typ / Ref</div>
                        <div>Info</div>
                      </div>
                      <div className="divide-y divide-slate-200">
                        {movements.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-slate-500">Noch keine Bewegungen.</div>
                        ) : (
                          movements.map((m) => (
                            <div
                              key={m.id}
                              className="grid grid-cols-[160px_110px_1fr] px-3 py-2 text-sm"
                            >
                              <div className="text-slate-700">
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
                                    className="text-[11px] text-slate-500 font-mono truncate"
                                    title={m.reference}
                                  >
                                    ref: {m.reference}
                                  </div>
                                ) : null}
                              </div>

                              <div className="text-slate-800">
                                <div>
                                  {Number(m.qty)} {m.unit || unit || "pcs"}
                                  {m.reason_code ? (
                                    <span className="text-slate-500"> — {m.reason_code}</span>
                                  ) : null}
                                </div>

                                {m.notes ? (
                                  <div className="mt-1 text-[12px] text-slate-700">
                                    <span className="text-slate-500">Notiz:</span> {m.notes}
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

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-100 p-3">
              <div className="text-xs text-slate-500">KI-Idee (nächster Sprint)</div>
              <div className="mt-1 text-sm text-slate-800">
                „Vorschlagen: Kategorie/Tags“, „Warnen: Dubletten“, „Preis plausibilisieren“, „Fehlende
                Pflichtfelder markieren“ – direkt hier im Drawer.
              </div>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Excel Import (Artikel)</div>
                <div className="text-sm text-slate-500">
                  Unterstützte Spalten: Produkt‑Nr., Suchbegriff, Technische Bezeichnung, Farbe, Gewicht, Aktiv/Inaktiv,
                  Einkaufspreis, Verkaufspreis.
                </div>
              </div>
              <button
                onClick={() => setImportOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await handleImportFile(file);
                  }}
                />
                <button
                  onClick={() => importFileRef.current?.click()}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
                >
                  Datei auswählen
                </button>
                <div className="text-sm text-slate-600">
                  {importFileName ? importFileName : "Keine Datei gewählt"}
                </div>
              </div>

              {importErr && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {importErr}
                </div>
              )}

              {importSummary && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Dateien: {importSummary.total} · gültig: {importSummary.valid} · fehlend: {importSummary.missing}
                  {importSummary.updated !== undefined ? (
                    <>
                      {" "}
                      · aktualisiert: {importSummary.updated} · neu: {importSummary.inserted}
                    </>
                  ) : null}
                </div>
              )}

              {importPreview.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="grid grid-cols-[160px_1fr_140px_140px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
                    <div>Produkt‑Nr.</div>
                    <div>Name</div>
                    <div>Einkauf</div>
                    <div>Verkauf</div>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {importPreview.map((r, idx) => (
                      <div
                        key={`${r.item_no}-${idx}`}
                        className="grid grid-cols-[160px_1fr_140px_140px] px-3 py-2 text-sm"
                      >
                        <div>{r.item_no}</div>
                        <div>{r.name}</div>
                        <div>{r.purchase_price ?? "—"}</div>
                        <div>{r.price ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setImportOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
              >
                Schliessen
              </button>
              <button
                disabled={importLoading}
                onClick={async () => {
                  if (!importFile) return setImportErr("Bitte Datei wählen.");
                  await runImport(importFile);
                }}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-60"
              >
                {importLoading ? "Importiere…" : "Import starten"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
