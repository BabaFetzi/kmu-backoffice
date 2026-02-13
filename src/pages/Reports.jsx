import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
}

function exportCsv(filename, rows) {
  if (!rows || rows.length === 0) return;
  const header = Object.keys(rows[0]);
  const lines = rows.map((r) =>
    header.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Bar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className="h-2 rounded-full bg-slate-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Sparkline({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.y), 1);
  const min = Math.min(...data.map((d) => d.y), 0);
  const w = 260;
  const h = 60;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * w;
      const y = h - ((d.y - min) / (max - min || 1)) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke="#0f172a" strokeWidth="2" points={points} />
    </svg>
  );
}

function Donut({ value, label }) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <svg width="90" height="90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} stroke="#e2e8f0" strokeWidth="10" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={r}
          stroke="#0f172a"
          strokeWidth="10"
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="55" textAnchor="middle" fontSize="16" fill="#0f172a" fontWeight="600">
          {pct}%
        </text>
      </svg>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-slate-500">Retourenquote gesamt</div>
      </div>
    </div>
  );
}

function exportPdf() {
  window.print();
}

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [returnRate, setReturnRate] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [vatRows, setVatRows] = useState([]);
  const [arRows, setArRows] = useState([]);
  const [apRows, setApRows] = useState([]);
  const [dqRows, setDqRows] = useState([]);
  const [err, setErr] = useState("");
  const [exportMsg, setExportMsg] = useState("");

  useEffect(() => {
    async function load() {
      const [
        { data: s, error: e1 },
        { data: t, error: e2 },
        { data: r, error: e3 },
        { data: p, error: e4 },
        { data: v, error: e5 },
        { data: ar, error: e6 },
        { data: ap, error: e7 },
        { data: dq, error: e8 },
      ] = await Promise.all([
        supabase.from("report_sales_monthly").select("month, gross_total, net_total, vat_total, orders_count").order("month", { ascending: false }),
        supabase.from("report_top_items").select("item_name, sold_qty, returned_qty").limit(10),
        supabase.from("report_return_rate").select("sold_qty, returned_qty, return_rate_pct").single(),
        supabase.from("report_purchases_by_supplier").select("supplier_name, purchase_total, orders_count").limit(10),
        supabase.from("report_vat_by_rate_monthly").select("month, vat_code, vat_rate, net_total, vat_total, gross_total").order("month", { ascending: false }),
        supabase.from("report_ar_summary").select("customer_name, open_total, invoices_count").limit(20),
        supabase.from("report_ap_summary").select("supplier_name, open_total, orders_count").limit(20),
        supabase.from("data_quality_issues").select("issue_type, entity, entity_id, message"),
      ]);

      if (e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8) {
        setErr(
          e1?.message ||
            e2?.message ||
            e3?.message ||
            e4?.message ||
            e5?.message ||
            e6?.message ||
            e7?.message ||
            e8?.message ||
            "Fehler"
        );
      }
      setSales(s || []);
      setTopItems(t || []);
      setReturnRate(r || null);
      setPurchases(p || []);
      setVatRows(v || []);
      setArRows(ar || []);
      setApRows(ap || []);
      setDqRows(dq || []);
    }

    load();
  }, []);

  const maxSales = useMemo(() => Math.max(0, ...sales.map((s) => Number(s.gross_total || 0))), [sales]);
  const maxTop = useMemo(() => Math.max(0, ...topItems.map((t) => Number(t.sold_qty || 0))), [topItems]);
  const maxPurch = useMemo(() => Math.max(0, ...purchases.map((p) => Number(p.purchase_total || 0))), [purchases]);
  const salesSpark = useMemo(
    () =>
      sales
        .slice()
        .reverse()
        .map((s) => ({ x: s.month, y: Number(s.gross_total || 0) })),
    [sales]
  );

  return (
    <div className="space-y-4 reports-print">
      <div>
        <h1 className="text-xl font-semibold">Auswertungen</h1>
        <p className="text-sm text-slate-500">Schnell-Insights mit einfachen Charts.</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={exportPdf}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
        >
          PDF drucken
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}
      {exportMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {exportMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Umsatz pro Monat (Brutto)</div>
            <Sparkline data={salesSpark} />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <button
              onClick={() => {
                exportCsv("report_sales_monthly.csv", sales);
                setExportMsg("Sales-Report exportiert.");
                setTimeout(() => setExportMsg(""), 1200);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1"
            >
              CSV exportieren
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {sales.map((s) => (
              <div key={s.month} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{new Date(s.month).toLocaleDateString("de-CH", { year: "numeric", month: "short" })}</span>
                  <span>{formatCHF(s.gross_total)}</span>
                </div>
                <Bar value={Number(s.gross_total || 0)} max={maxSales} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="font-semibold">Retourenquote</div>
          <div className="mt-3">
            <Donut value={Number(returnRate?.return_rate_pct || 0)} label="Retourenquote" />
            <div className="mt-2 text-xs text-slate-500">
              Verkauft: {Number(returnRate?.sold_qty || 0)} · Retouren: {Number(returnRate?.returned_qty || 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="font-semibold">Top Artikel (Menge)</div>
          <div className="mt-2 text-xs text-slate-500">
            <button
              onClick={() => {
                exportCsv("report_top_items.csv", topItems);
                setExportMsg("Top-Artikel exportiert.");
                setTimeout(() => setExportMsg(""), 1200);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1"
            >
              CSV exportieren
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {topItems.map((t) => (
              <div key={t.item_name} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{t.item_name}</span>
                  <span>{Number(t.sold_qty || 0)}</span>
                </div>
                <Bar value={Number(t.sold_qty || 0)} max={maxTop} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">MWST Auswertung (monatlich)</div>
            <button
              onClick={() => {
                exportCsv("report_mwst_monthly.csv", vatRows);
                setExportMsg("MWST-Report exportiert.");
                setTimeout(() => setExportMsg(""), 1200);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
            >
              CSV exportieren
            </button>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[120px_90px_1fr_120px_120px_120px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <div>Monat</div>
              <div>Satz</div>
              <div>Code</div>
              <div className="text-right">Netto</div>
              <div className="text-right">MWST</div>
              <div className="text-right">Brutto</div>
            </div>
            <div className="divide-y divide-slate-200">
              {vatRows.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">Keine Daten.</div>
              ) : (
                vatRows.map((r) => (
                  <div
                    key={`${r.month}-${r.vat_code}-${r.vat_rate}`}
                    className="grid grid-cols-[120px_90px_1fr_120px_120px_120px] px-3 py-2 text-xs"
                  >
                    <div>{new Date(r.month).toLocaleDateString("de-CH", { year: "numeric", month: "short" })}</div>
                    <div>{Number(r.vat_rate || 0).toFixed(1)}%</div>
                    <div>{r.vat_code || "—"}</div>
                    <div className="text-right">{formatCHF(r.net_total)}</div>
                    <div className="text-right">{formatCHF(r.vat_total)}</div>
                    <div className="text-right">{formatCHF(r.gross_total)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="font-semibold">Einkauf je Lieferant</div>
          <div className="mt-2 text-xs text-slate-500">
            <button
              onClick={() => {
                exportCsv("report_purchases_by_supplier.csv", purchases);
                setExportMsg("Lieferanten-Report exportiert.");
                setTimeout(() => setExportMsg(""), 1200);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1"
            >
              CSV exportieren
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {purchases.map((p) => (
              <div key={p.supplier_name} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>{p.supplier_name}</span>
                  <span>{formatCHF(p.purchase_total)}</span>
                </div>
                <Bar value={Number(p.purchase_total || 0)} max={maxPurch} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Debitoren (offen)</div>
            <button
              onClick={() => {
                exportCsv("report_debitoren.csv", arRows);
                setExportMsg("Debitoren-Report exportiert.");
                setTimeout(() => setExportMsg(""), 1200);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
            >
              CSV exportieren
            </button>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1fr_120px_120px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <div>Kunde</div>
              <div className="text-right">Offen</div>
              <div className="text-right">Belege</div>
            </div>
            <div className="divide-y divide-slate-200">
              {arRows.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">Keine Daten.</div>
              ) : (
                arRows.map((r) => (
                  <div key={r.customer_name} className="grid grid-cols-[1fr_120px_120px] px-3 py-2 text-xs">
                    <div className="truncate">{r.customer_name}</div>
                    <div className="text-right">{formatCHF(r.open_total)}</div>
                    <div className="text-right">{r.invoices_count}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Kreditoren (offen)</div>
            <button
              onClick={() => {
                exportCsv("report_kreditoren.csv", apRows);
                setExportMsg("Kreditoren-Report exportiert.");
                setTimeout(() => setExportMsg(""), 1200);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
            >
              CSV exportieren
            </button>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1fr_120px_120px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <div>Lieferant</div>
              <div className="text-right">Offen</div>
              <div className="text-right">Bestellungen</div>
            </div>
            <div className="divide-y divide-slate-200">
              {apRows.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">Keine Daten.</div>
              ) : (
                apRows.map((r) => (
                  <div key={r.supplier_name} className="grid grid-cols-[1fr_120px_120px] px-3 py-2 text-xs">
                    <div className="truncate">{r.supplier_name}</div>
                    <div className="text-right">{formatCHF(r.open_total)}</div>
                    <div className="text-right">{r.orders_count}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Datenqualität (Checks)</div>
          <button
            onClick={() => {
              exportCsv("data_quality_issues.csv", dqRows);
              setExportMsg("Datenqualitäts-Report exportiert.");
              setTimeout(() => setExportMsg(""), 1200);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          >
            CSV exportieren
          </button>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[180px_120px_1fr] bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <div>Typ</div>
            <div>Entity</div>
            <div>Hinweis</div>
          </div>
          <div className="divide-y divide-slate-200">
            {dqRows.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">Keine Auffälligkeiten.</div>
            ) : (
              dqRows.map((r, idx) => (
                <div key={`${r.issue_type}-${idx}`} className="grid grid-cols-[180px_120px_1fr] px-3 py-2 text-xs">
                  <div className="font-medium">{r.issue_type}</div>
                  <div>{r.entity}</div>
                  <div className="text-slate-600">{r.message}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
