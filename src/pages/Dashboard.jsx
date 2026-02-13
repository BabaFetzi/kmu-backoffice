import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { buildCashflowForecast } from "../lib/cashflowForecast";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-CH");
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [agingRows, setAgingRows] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr("");
      try {
        const [{ data: orderRows, error: orderErr }, { data: poRows, error: poErr }] = await Promise.all([
          supabase
            .from("order_fulfillment_audit")
            .select("order_id, order_status, net_qty, last_movement_at")
            .order("last_movement_at", { ascending: false }),
          supabase
            .from("purchase_orders")
            .select("id, status, delivery_date, created_at, lines:purchase_order_lines (qty, unit_cost)")
            .order("created_at", { ascending: false }),
        ]);
        if (orderErr) throw orderErr;
        if (poErr) throw poErr;

        const [{ data: taskRows, error: taskErr }, { data: lowRows, error: lowErr }, { data: agingData, error: agingErr }] =
          await Promise.all([
          supabase
            .from("tasks")
            .select("id, status, due_date")
            .order("due_date", { ascending: true }),
          supabase
            .from("items")
            .select("id, item_no, name, current_stock, unit, status")
            .eq("status", "active")
            .order("current_stock", { ascending: true })
            .limit(8),
          supabase
            .from("open_items_aging_view")
            .select("order_id, gross_total, aging_bucket, due_date")
            .order("due_date", { ascending: true }),
        ]);
        if (taskErr) throw taskErr;
        if (lowErr) throw lowErr;
        if (agingErr) throw agingErr;

        setOrders(orderRows || []);
        setPurchases(poRows || []);
        setTasks(taskRows || []);
        setLowStock(lowRows || []);
        setAgingRows(agingData || []);
      } catch (e) {
        setErr(prettySupabaseError(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const orderStats = useMemo(() => {
    const total = orders.length;
    const open = orders.filter((o) => o.order_status === "open").length;
    const done = orders.filter((o) => o.order_status === "done").length;
    const retoure = orders.filter((o) => o.order_status === "retoure").length;
    const storno = orders.filter((o) => o.order_status === "storno").length;
    return { total, open, done, retoure, storno };
  }, [orders]);

  const purchaseStats = useMemo(() => {
    const total = purchases.length;
    const open = purchases.filter((p) => p.status === "open").length;
    const ordered = purchases.filter((p) => p.status === "ordered").length;
    const received = purchases.filter((p) => p.status === "received").length;
    const cancelled = purchases.filter((p) => p.status === "cancelled").length;
    return { total, open, ordered, received, cancelled };
  }, [purchases]);

  const taskStats = useMemo(() => {
    const total = tasks.length;
    const open = tasks.filter((t) => t.status === "open").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const done = tasks.filter((t) => t.status === "done").length;
    return { total, open, inProgress, done };
  }, [tasks]);

  const agingStats = useMemo(() => {
    const buckets = {
      not_due: 0,
      "1_30": 0,
      "31_60": 0,
      "61_90": 0,
      "90_plus": 0,
    };
    agingRows.forEach((r) => {
      const key = r.aging_bucket || "not_due";
      if (buckets[key] !== undefined) {
        buckets[key] += Number(r.gross_total || 0);
      }
    });
    return buckets;
  }, [agingRows]);

  const cashflow = useMemo(() => {
    return buildCashflowForecast({
      agingRows,
      purchaseOrders: purchases,
      today: new Date(),
      horizonDays: 30,
    });
  }, [agingRows, purchases]);

  const kpiCards = [
    { label: "Aufträge gesamt", value: orderStats.total },
    { label: "Offen", value: orderStats.open },
    { label: "Erledigt", value: orderStats.done },
    { label: "Retouren", value: orderStats.retoure },
    { label: "Storno", value: orderStats.storno },
    { label: "Einkauf offen", value: purchaseStats.open },
    { label: "Bestellt", value: purchaseStats.ordered },
    { label: "Wareneingang", value: purchaseStats.received },
    { label: "Aufgaben offen", value: taskStats.open },
    { label: "In Arbeit", value: taskStats.inProgress },
    { label: "Erledigt", value: taskStats.done },
  ];

  return (
    <div className="erp-page">
      <div>
        <h1 className="erp-page-title">Dashboard</h1>
        <p className="erp-page-subtitle">Schneller Überblick über Aufträge, Liquidität, Einkauf, Aufgaben und Lager.</p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((k, idx) => (
          <div key={`${k.label}-${idx}`} className="erp-card">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className="mt-2 text-2xl font-semibold">{loading ? "…" : k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="erp-card">
          <div className="font-semibold">Offene Posten – Fälligkeit</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="erp-card-subtle">
              <div className="text-xs text-slate-500">Noch nicht fällig</div>
              <div className="text-lg font-semibold">{formatCHF(agingStats.not_due)}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs text-amber-700">1–30 Tage</div>
              <div className="text-lg font-semibold text-amber-700">{formatCHF(agingStats["1_30"])}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs text-amber-700">31–60 Tage</div>
              <div className="text-lg font-semibold text-amber-700">{formatCHF(agingStats["31_60"])}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs text-rose-700">61–90 Tage</div>
              <div className="text-lg font-semibold text-rose-700">{formatCHF(agingStats["61_90"])}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs text-rose-700">90+ Tage</div>
              <div className="text-lg font-semibold text-rose-700">{formatCHF(agingStats["90_plus"])}</div>
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="font-semibold">Liquiditätsvorschau (30 Tage)</div>
          <div className="mt-1 text-xs text-slate-500">
            Zeitraum bis {formatDate(cashflow.horizonEnd)}
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Erwartete Einzahlungen</span>
              <span className="font-medium text-emerald-700">{formatCHF(cashflow.incoming30)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>davon überfällig</span>
              <span className="font-medium text-amber-700">{formatCHF(cashflow.overdueReceivables)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Erwartete Auszahlungen</span>
              <span className="font-medium text-rose-700">{formatCHF(cashflow.outgoing30)}</span>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between">
              <span className="font-medium">Netto-Prognose</span>
              <span
                className={`text-base font-semibold ${
                  cashflow.net30 < 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {formatCHF(cashflow.net30)}
              </span>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Offene Einkaufsaufträge: {cashflow.openPurchaseOrders} · ohne Liefertermin:{" "}
            {cashflow.missingDeliveryDate}
          </div>
        </div>

        <div className="erp-card">
          <div className="font-semibold">Einkauf Status</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Offen</span>
              <span>{purchaseStats.open}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Bestellt</span>
              <span>{purchaseStats.ordered}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Wareneingang</span>
              <span>{purchaseStats.received}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Storno</span>
              <span>{purchaseStats.cancelled}</span>
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="font-semibold">Lager – niedrigster Bestand</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[120px_1fr_90px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <div>Artikel</div>
              <div>Name</div>
              <div className="text-right">Bestand</div>
            </div>
            <div className="divide-y divide-slate-200">
              {lowStock.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">Keine Daten.</div>
              ) : (
                lowStock.map((it) => (
                  <div key={it.id} className="grid grid-cols-[120px_1fr_90px] px-3 py-2 text-sm">
                    <div className="text-slate-600">{it.item_no || "—"}</div>
                    <div className="truncate">{it.name || "—"}</div>
                    <div className="text-right">
                      {Number(it.current_stock || 0)} {it.unit || "pcs"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="erp-card">
        <div className="font-semibold">Aufgaben Überblick</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="erp-card-subtle">
            <div className="text-xs text-slate-500">Offen</div>
            <div className="text-xl font-semibold">{taskStats.open}</div>
          </div>
          <div className="erp-card-subtle">
            <div className="text-xs text-slate-500">In Arbeit</div>
            <div className="text-xl font-semibold">{taskStats.inProgress}</div>
          </div>
          <div className="erp-card-subtle">
            <div className="text-xs text-slate-500">Erledigt</div>
            <div className="text-xl font-semibold">{taskStats.done}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
