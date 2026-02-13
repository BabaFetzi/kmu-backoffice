import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      : tone === "bad"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-white text-slate-800";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${toneCls}`}>
      {children}
    </span>
  );
}

function statusLabel(status) {
  const s = String(status || "open").toLowerCase();
  if (s === "open") return { text: "OFFEN", tone: "warn" };
  if (s === "ordered") return { text: "BESTELLT", tone: "info" };
  if (s === "received") return { text: "ERFASST", tone: "ok" };
  if (s === "cancelled") return { text: "STORNO", tone: "bad" };
  return { text: s.toUpperCase(), tone: "default" };
}

export default function Purchases() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [supplierItems, setSupplierItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendOrder, setSendOrder] = useState(null);
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  // Create purchase
  const [supplierId, setSupplierId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  // Expand + add line
  const [expanded, setExpanded] = useState({});
  const [lineByOrder, setLineByOrder] = useState({});
  const postingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");

    const [
      { data: supplierRows, error: supplierErr },
      { data: itemRows, error: itemErr },
      { data: supplierItemRows, error: supplierItemErr },
    ] = await Promise.all([
      supabase
        .from("suppliers")
        .select("id, company_name, status")
        .order("company_name", { ascending: true }),
      supabase
        .from("items")
        .select("id, name, unit, status, supplier_id, purchase_price")
        .eq("status", "active")
        .order("name", { ascending: true }),
      supabase
        .from("supplier_items")
        .select("supplier_id, item_id, purchase_price, currency, supplier_item_no, item:items ( id, name, purchase_price )")
        .order("supplier_id", { ascending: true }),
    ]);

    if (supplierErr) setErr(prettySupabaseError(supplierErr));
    if (itemErr) setErr(prettySupabaseError(itemErr));
    if (supplierItemErr) setErr(prettySupabaseError(supplierItemErr));

    setSuppliers((supplierRows || []).filter((s) => (s.status || "active") === "active"));
    setItems(itemRows || []);
    setSupplierItems(supplierItemRows || []);

    const { data: orderRows, error: orderErr } = await supabase
      .from("purchase_orders")
      .select(
        `
        id, supplier_id, status, order_date, delivery_date, notes, reference_no, received_at, created_at, sent_at, sent_to,
        supplier:suppliers ( id, company_name, email ),
        lines:purchase_order_lines (
          id, item_id, qty, unit, unit_cost, currency, notes,
          item:items ( id, name, unit )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (orderErr) setErr(prettySupabaseError(orderErr));
    setOrders(orderRows || []);

    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (deepLinkHandled || orders.length === 0) return;
    const raw = localStorage.getItem("deepLink");
    if (!raw) return;
    try {
      const dl = JSON.parse(raw);
      if (dl.module === "purchases" && dl.id) {
        queueMicrotask(() => {
          setExpanded((prev) => ({ ...prev, [dl.id]: true }));
        });
        localStorage.removeItem("deepLink");
        queueMicrotask(() => {
          setDeepLinkHandled(true);
        });
      }
    } catch {
      localStorage.removeItem("deepLink");
    }
  }, [orders, deepLinkHandled]);

  const totalsById = useMemo(() => {
    return (orders || []).reduce((acc, o) => {
      const qty = (o.lines || []).reduce((sum, l) => sum + Number(l.qty || 0), 0);
      const chf = (o.lines || []).reduce((sum, l) => {
        const cost = Number(l.unit_cost || 0);
        return sum + Number(l.qty || 0) * cost;
      }, 0);
      acc[o.id] = { qty, chf };
      return acc;
    }, {});
  }, [orders]);

  async function createOrder(e) {
    e.preventDefault();
    setErr("");

    if (!supplierId) return setErr("Bitte Lieferant wählen.");
    if (!deliveryDate) return setErr("Bitte Liefertermin wählen.");

    const { error } = await supabase.from("purchase_orders").insert({
      supplier_id: supplierId,
      reference_no: referenceNo.trim() || null,
      notes: notes.trim() || null,
      delivery_date: deliveryDate,
      status: "open",
    });

    if (error) return setErr(prettySupabaseError(error));

    setSupplierId("");
    setReferenceNo("");
    setNotes("");
    setDeliveryDate(new Date().toISOString().slice(0, 10));
    await load();
  }

  function getLineState(orderId) {
    return lineByOrder[orderId] || { itemId: "", qty: "1", unitCost: "" };
  }

  function setLineState(orderId, patch) {
    setLineByOrder((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || { itemId: "", qty: "1", unitCost: "" }), ...patch },
    }));
  }

  async function addLine(order) {
    if (postingRef.current) return;
    setErr("");

    const lineState = getLineState(order.id);
    const qty = Number(lineState.qty);
    if (!order?.id) return;
    if (!lineState.itemId) return setErr("Bitte Artikel wählen.");
    if (!Number.isFinite(qty) || qty <= 0) return setErr("Menge muss > 0 sein.");

    postingRef.current = true;

    const it = items.find((i) => i.id === lineState.itemId);
    const si = supplierItems.find(
      (x) => x.supplier_id === order.supplier_id && x.item_id === lineState.itemId
    );
    if (!si || si.purchase_price === undefined || si.purchase_price === null) {
      if (!it || it.purchase_price === undefined || it.purchase_price === null) {
        postingRef.current = false;
        return setErr("Kein Lieferantenpreis und kein Artikel-Einkaufspreis hinterlegt.");
      }
    }
    const { error } = await supabase.from("purchase_order_lines").insert({
      purchase_order_id: order.id,
      item_id: lineState.itemId,
      qty,
      unit: (it?.unit || "pcs").trim() || "pcs",
      unit_cost: Number(si?.purchase_price ?? it?.purchase_price),
      currency: "CHF",
    });

    postingRef.current = false;

    if (error) return setErr(prettySupabaseError(error));

    setLineState(order.id, { itemId: "", qty: "1", unitCost: "" });
    await load();
  }

  async function receive(orderId) {
    setErr("");
    const { error } = await supabase.rpc("receive_purchase_order", { p_order_id: orderId });
    if (error) return setErr(prettySupabaseError(error));
    await load();
  }

  async function cancel(orderId) {
    const ok = confirm("Einkauf stornieren?");
    if (!ok) return;
    setErr("");
    const { error } = await supabase.rpc("cancel_purchase_order", { p_order_id: orderId });
    if (error) return setErr(prettySupabaseError(error));
    await load();
  }

  function openSend(order) {
    setSendOrder(order);
    setSendTo(order?.supplier?.email || "");
    setSendOpen(true);
  }

  async function markSent() {
    if (!sendOrder) return;
    if (!sendTo.trim()) return setErr("Bitte Empfänger-Email angeben.");
    setSending(true);
    setErr("");
    const { error } = await supabase.rpc("mark_purchase_sent", {
      p_order_id: sendOrder.id,
      p_sent_to: sendTo.trim(),
    });

    setSending(false);
    if (error) return setErr(prettySupabaseError(error));

    setSendOpen(false);
    setSendOrder(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Einkauf / Wareneingang</h1>
          <p className="text-sm text-slate-500">Bestellungen an Lieferanten & Wareneingang buchen.</p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium text-slate-800 mb-2">Neuen Einkauf anlegen</div>
        <form onSubmit={createOrder} className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Lieferant *</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="">— wählen —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Referenz</label>
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              placeholder="z.B. Angebot/Bestellnr."
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notiz</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Liefertermin *</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
            >
              Anlegen
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            Lade…
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            Noch keine Einkäufe.
          </div>
        ) : (
          orders.map((o) => {
            const st = statusLabel(o.status);
            const totals = totalsById[o.id] || { qty: 0, chf: 0 };
            const isOpen = expanded[o.id];

            return (
              <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm text-slate-500">Einkauf</div>
                  <div className="font-semibold">{o.supplier?.company_name || "—"}</div>
                  <Badge tone={st.tone}>{st.text}</Badge>
                  {o.status === "ordered" && (
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Bestellt{`${
                        o.sent_at ? ` · ${new Date(o.sent_at).toLocaleDateString("de-CH")}` : ""
                      }`}
                    </span>
                  )}
                  <div className="text-xs text-slate-500">
                    {o.order_date ? new Date(o.order_date).toLocaleDateString("de-CH") : "—"}
                    {o.delivery_date
                      ? ` • Liefertermin: ${new Date(o.delivery_date).toLocaleDateString("de-CH")}`
                      : ""}
                    {o.sent_at
                      ? ` • Bestellt: ${new Date(o.sent_at).toLocaleString("de-CH")}${
                          o.sent_to ? ` · an ${o.sent_to}` : ""
                        }`
                      : o.status === "ordered"
                      ? " • Bestellt"
                      : ""}
                  </div>
                  <div className="text-xs text-slate-500">
                    Positionen: {totals.qty} · Summe: {formatCHF(totals.chf)}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                    >
                      {isOpen ? "Positionen ausblenden" : "Positionen anzeigen"}
                    </button>
                    {o.status === "open" && (
                      <>
                        <button
                          onClick={() => openSend(o)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          Bestellung senden
                        </button>
                        <button
                          onClick={() => receive(o.id)}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
                        >
                          Wareneingang buchen
                        </button>
                        <button
                          onClick={() => cancel(o.id)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-100"
                        >
                          Stornieren
                        </button>
                      </>
                    )}
                    {o.status === "ordered" && (
                      <button
                        onClick={() => receive(o.id)}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
                      >
                        Wareneingang buchen
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">Position hinzufügen</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1.5fr_120px_120px_auto]">
                        <select
                          value={getLineState(o.id).itemId}
                          onChange={(e) => {
                            const next = e.target.value;
                            const si = supplierItems.find(
                              (x) => x.supplier_id === o.supplier_id && x.item_id === next
                            );
                            const it = items.find((i) => i.id === next);
                            if (si && si.purchase_price !== undefined && si.purchase_price !== null) {
                              setLineState(o.id, { itemId: next, unitCost: String(si.purchase_price) });
                            } else {
                              if (it && it.purchase_price !== undefined && it.purchase_price !== null) {
                                setLineState(o.id, { itemId: next, unitCost: String(it.purchase_price) });
                              } else {
                                setLineState(o.id, { itemId: next, unitCost: "" });
                              }
                            }
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                        >
                          <option value="">— Artikel wählen —</option>
                          {(() => {
                            const supplierCatalog = supplierItems.filter((it) => it.supplier_id === o.supplier_id);
                            const supplierItemIds = new Set(supplierCatalog.map((it) => it.item_id));
                            const fallbackItems = items.filter(
                              (it) => it.supplier_id === o.supplier_id && !supplierItemIds.has(it.id)
                            );

                            const list = [
                              ...supplierCatalog.map((si) => ({
                                itemId: si.item_id,
                                name: si.item?.name || items.find((x) => x.id === si.item_id)?.name || "Artikel",
                                price:
                                  si.purchase_price ??
                                  si.item?.purchase_price ??
                                  items.find((x) => x.id === si.item_id)?.purchase_price,
                              })),
                              ...fallbackItems.map((it) => ({
                                itemId: it.id,
                                name: it.name || "Artikel",
                                price: it.purchase_price,
                              })),
                            ];

                            return list.map((it) => (
                              <option key={it.itemId} value={it.itemId}>
                                {it.name} {it.price ? `• ${formatCHF(it.price)}` : "• Preis fehlt"}
                              </option>
                            ));
                          })()}
                        </select>
                        <input
                          value={getLineState(o.id).qty}
                          onChange={(e) => setLineState(o.id, { qty: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                          placeholder="Menge"
                          inputMode="decimal"
                        />
                        <input
                          value={getLineState(o.id).unitCost}
                          readOnly
                          disabled
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                          placeholder="Stk-Preis (vom Lieferanten)"
                          inputMode="decimal"
                        />
                        <button
                          onClick={() => addLine(o)}
                          className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200"
                        >
                          Hinzufügen
                        </button>
                      </div>
                      {supplierItems.filter((it) => it.supplier_id === o.supplier_id).length === 0 && (
                        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          Keine Lieferantenpreise vorhanden. Auswahl ist möglich (Artikelpreis als Fallback),
                          aber im Lieferanten-Modul bitte Preise pflegen.
                        </div>
                      )}
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="grid grid-cols-[1.4fr_120px_120px_120px] bg-white px-3 py-2 text-xs text-slate-700">
                        <div>Artikel</div>
                        <div>Menge</div>
                        <div>Preis</div>
                        <div>Summe</div>
                      </div>
                      <div className="divide-y divide-slate-200">
                        {(o.lines || []).length === 0 ? (
                          <div className="px-3 py-3 text-sm text-slate-500">Noch keine Positionen.</div>
                        ) : (
                          (o.lines || []).map((l) => (
                            <div key={l.id} className="grid grid-cols-[1.4fr_120px_120px_120px] px-3 py-2 text-sm">
                              <div className="text-slate-800">{l.item?.name || "—"}</div>
                              <div className="text-slate-700">{Number(l.qty)} {l.unit || "pcs"}</div>
                              <div className="text-slate-700">{formatCHF(l.unit_cost)}</div>
                              <div className="text-slate-700">{formatCHF(Number(l.qty || 0) * Number(l.unit_cost || 0))}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {sendOpen && sendOrder && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-lg font-semibold">Bestellung senden</div>
                <div className="text-sm text-slate-500">
                  Professioneller Versand: PDF exportieren und per Email senden. (MVP: Versandstatus setzen)
                </div>
              </div>
              <button
                onClick={() => setSendOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">Empfänger Email *</div>
                <input
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Vorschau</div>
                <div className="mt-1 text-sm text-slate-800">
                  Lieferant: {sendOrder.supplier?.company_name || "—"} <br />
                  Liefertermin:{" "}
                  {sendOrder.delivery_date
                    ? new Date(sendOrder.delivery_date).toLocaleDateString("de-CH")
                    : "—"}
                  <br />
                  Positionen: {(sendOrder.lines || []).length}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setSendOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
              >
                Abbrechen
              </button>
              <button
                disabled={sending}
                onClick={markSent}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-60"
              >
                {sending ? "Senden…" : "Als gesendet markieren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
