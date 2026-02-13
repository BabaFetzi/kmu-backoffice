import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Movements() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [q, setQ] = useState(""); // search by item name or reference
  const [reasonFilter, setReasonFilter] = useState("all");

  async function loadMovements() {
    setLoading(true);
    setErr("");
    try {
      // Wir joinen Items, damit du den Artikelnamen siehst
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, created_at, movement_type, qty, unit, qty_change, reason_code, reason, reference, notes, item_id, order_id, order_line_id, items(name)"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMovements();
     
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const name = r.items?.name || "";
      const ref = r.reference || "";
      const reason = r.reason_code || r.reason || "";
      const notes = r.notes || "";
      const hay = `${name} ${ref} ${reason} ${notes}`.toLowerCase();
      const matchesText = !s || hay.includes(s);
      const matchesReason =
        reasonFilter === "all" ? true : (r.reason_code || r.movement_type) === reasonFilter;
      return matchesText && matchesReason;
    });
  }, [rows, q, reasonFilter]);

  function copyCsv() {
    if (filtered.length === 0) return;
    const header = [
      "created_at",
      "reason_code",
      "movement_type",
      "qty",
      "unit",
      "qty_change",
      "item_name",
      "reference",
      "order_id",
      "order_line_id",
      "notes",
    ];
    const lines = filtered.map((r) =>
      [
        r.created_at || "",
        r.reason_code || "",
        r.movement_type || "",
        String(r.qty ?? ""),
        r.unit || "",
        String(r.qty_change ?? ""),
        r.items?.name || "",
        r.reference || "",
        r.order_id || "",
        r.order_line_id || "",
        r.notes || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    navigator.clipboard.writeText([header.join(","), ...lines].join("\n")).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bewegungs‑Journal</h1>
          <p className="text-sm text-slate-500">Nachvollziehbarer Warenfluss für Audit & Debug.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMovements}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
          >
            {loading ? "Lade…" : "Refresh"}
          </button>
          <button
            onClick={copyCsv}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
          >
            CSV kopieren
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche: Artikelname, AUF-Nummer, reason, Notiz…"
          className="w-full md:w-[420px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
        />
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Alle</option>
          <option value="sale">sale</option>
          <option value="return">return</option>
          <option value="cancel">cancel</option>
          <option value="inventory">inventory</option>
          <option value="correction">correction</option>
        </select>
        <div className="text-xs text-slate-500">
          {filtered.length} Einträge
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[170px_90px_80px_90px_160px_200px_1fr] gap-0 bg-slate-100 px-4 py-3 text-xs text-slate-700">
          <div>Datum</div>
          <div>Typ</div>
          <div>Menge</div>
          <div>Einheit</div>
          <div>Artikel</div>
          <div>Reference</div>
          <div>Wieso (reason/notes)</div>
        </div>

        <div className="divide-y divide-slate-200">
          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">Keine Bewegungen gefunden.</div>
          ) : (
            filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[170px_90px_80px_90px_160px_200px_1fr] px-4 py-3 text-sm items-start"
              >
                <div className="text-[11px] text-slate-600 font-mono">
                  {r.created_at ? new Date(r.created_at).toLocaleString("de-CH") : ""}
                </div>
                <div className="font-medium">{r.reason_code || r.movement_type}</div>
                <div>{r.qty}</div>
                <div>{r.unit}</div>
                <div className="text-slate-700">{r.items?.name || "-"}</div>
                <div className="text-[11px] text-slate-600 font-mono truncate">{r.reference || "-"}</div>
                <div className="text-[12px] text-slate-600">
                  <div className="font-medium text-slate-800">{r.reason_code || r.reason || "-"}</div>
                  {r.notes ? <div className="mt-1">{r.notes}</div> : null}
                  {(r.order_id || r.order_line_id) ? (
                    <div className="mt-1 text-[11px] text-slate-500 font-mono">
                      {r.order_id ? <>order: {r.order_id}</> : null}
                      {r.order_line_id ? (
                        <> {r.order_id ? " | " : ""}line: {r.order_line_id}</>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
