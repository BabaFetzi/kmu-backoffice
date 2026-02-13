import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function toCsv(rows, header) {
  const lines = rows.map((r) =>
    header
      .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export default function Audit() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState([]);
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data: sumRows, error: sumErr } = await supabase
        .from("order_fulfillment_audit")
        .select("order_id, order_no, order_status, ordered_qty, delivered_qty, returned_qty, net_qty, last_movement_at")
        .order("last_movement_at", { ascending: false });
      if (sumErr) throw sumErr;

      const { data: lineRows, error: lineErr } = await supabase
        .from("order_line_fulfillment_audit")
        .select(
          "order_id, order_no, order_status, order_line_id, item_id, item_name, ordered_qty, delivered_qty, returned_qty, net_qty, last_movement_at"
        )
        .order("last_movement_at", { ascending: false });
      if (lineErr) throw lineErr;

      setSummary(sumRows || []);
      setLines(lineRows || []);
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredSummary = useMemo(() => {
    const s = q.trim().toLowerCase();
    return summary.filter((r) => {
      const matchesText = !s || String(r.order_no || "").toLowerCase().includes(s);
      const matchesStatus = statusFilter === "all" || r.order_status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [summary, q, statusFilter]);

  const filteredLines = useMemo(() => {
    const s = q.trim().toLowerCase();
    return lines.filter((r) => {
      const hay = `${r.order_no || ""} ${r.item_name || ""}`.toLowerCase();
      const matchesText = !s || hay.includes(s);
      const matchesStatus = statusFilter === "all" || r.order_status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [lines, q, statusFilter]);

  function copySummaryCsv() {
    if (filteredSummary.length === 0) return;
    const header = [
      "order_no",
      "order_status",
      "ordered_qty",
      "delivered_qty",
      "returned_qty",
      "net_qty",
      "last_movement_at",
    ];
    navigator.clipboard.writeText(toCsv(filteredSummary, header)).catch(() => {});
  }

  function copyLinesCsv() {
    if (filteredLines.length === 0) return;
    const header = [
      "order_no",
      "order_status",
      "item_name",
      "ordered_qty",
      "delivered_qty",
      "returned_qty",
      "net_qty",
      "last_movement_at",
    ];
    navigator.clipboard.writeText(toCsv(filteredLines, header)).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Audit</h1>
          <p className="text-sm text-slate-500">Lückenlose Übersicht über Aufträge & Warenfluss.</p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
        >
          {loading ? "Lade…" : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche nach AUF-Nummer oder Artikel…"
          className="w-full md:w-[420px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Alle</option>
          <option value="open">open</option>
          <option value="done">done</option>
          <option value="retoure">retoure</option>
          <option value="storno">storno</option>
        </select>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Auftrags‑Zusammenfassung</div>
          <button
            onClick={copySummaryCsv}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
          >
            CSV kopieren
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[140px_90px_100px_100px_100px_100px_160px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <div>Order</div>
            <div>Status</div>
            <div>Ordered</div>
            <div>Delivered</div>
            <div>Returned</div>
            <div>Net</div>
            <div>Letzte Bewegung</div>
          </div>
          <div className="divide-y divide-slate-200">
            {filteredSummary.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">Keine Einträge.</div>
            ) : (
              filteredSummary.map((r) => (
                <div
                  key={r.order_id}
                  className="grid grid-cols-[140px_90px_100px_100px_100px_100px_160px] px-3 py-2 text-sm"
                >
                  <div className="font-medium">{r.order_no}</div>
                  <div>{r.order_status}</div>
                  <div>{Number(r.ordered_qty || 0)}</div>
                  <div>{Number(r.delivered_qty || 0)}</div>
                  <div>{Number(r.returned_qty || 0)}</div>
                  <div>{Number(r.net_qty || 0)}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.last_movement_at ? new Date(r.last_movement_at).toLocaleString("de-CH") : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Positions‑Audit</div>
          <button
            onClick={copyLinesCsv}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
          >
            CSV kopieren
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[140px_200px_90px_90px_90px_90px_160px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <div>Order</div>
            <div>Artikel</div>
            <div>Ordered</div>
            <div>Delivered</div>
            <div>Returned</div>
            <div>Net</div>
            <div>Letzte Bewegung</div>
          </div>
          <div className="divide-y divide-slate-200">
            {filteredLines.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">Keine Einträge.</div>
            ) : (
              filteredLines.map((r) => (
                <div
                  key={r.order_line_id}
                  className="grid grid-cols-[140px_200px_90px_90px_90px_90px_160px] px-3 py-2 text-sm"
                >
                  <div className="font-medium">{r.order_no}</div>
                  <div className="truncate" title={r.item_name}>{r.item_name}</div>
                  <div>{Number(r.ordered_qty || 0)}</div>
                  <div>{Number(r.delivered_qty || 0)}</div>
                  <div>{Number(r.returned_qty || 0)}</div>
                  <div>{Number(r.net_qty || 0)}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.last_movement_at ? new Date(r.last_movement_at).toLocaleString("de-CH") : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
