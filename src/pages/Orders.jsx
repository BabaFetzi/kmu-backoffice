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
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
      : tone === "bad"
      ? "border-red-400/20 bg-red-500/10 text-red-200"
      : tone === "info"
      ? "border-sky-400/20 bg-sky-500/10 text-sky-200"
      : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${toneCls}`}>
      {children}
    </span>
  );
}

function statusLabel(status) {
  const s = String(status || "open").toLowerCase();
  if (s === "open") return { text: "OFFEN", tone: "info" };
  if (s === "done") return { text: "ERLEDIGT", tone: "ok" };
  if (s === "storno") return { text: "STORNO", tone: "bad" };
  if (s === "retoure") return { text: "RETOURE", tone: "warn" };
  return { text: s.toUpperCase(), tone: "default" };
}

function orderCardTone(status) {
  const s = String(status || "open").toLowerCase();
  if (s === "open") return "border-sky-400/20 bg-sky-500/5";
  if (s === "done") return "border-emerald-400/20 bg-emerald-500/5";
  if (s === "storno") return "border-red-400/20 bg-red-500/5";
  if (s === "retoure") return "border-amber-400/20 bg-amber-500/5";
  return "border-white/10 bg-white/5";
}

export default function Orders() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);

  // Create order draft
  const [draftItemId, setDraftItemId] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftLines, setDraftLines] = useState([]);

  // UI expand lines
  const [expanded, setExpanded] = useState({});
  const [selectedLineByOrder, setSelectedLineByOrder] = useState({});

  // Retour UI
  const [retQty, setRetQty] = useState("1");
  const [retNote, setRetNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const postingRef = useRef(false);
  const statusPostingRef = useRef(false);

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, unit, price, current_stock, status")
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) throw error;
    setItems(data || []);
  }, []);

  const loadOrders = useCallback(async () => {
    // Wir holen orders + lines + item name/unit/price.
    // Wichtig: order_lines.price_chf & unit existieren jetzt (SQL oben).
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id, order_no, status, total_chf, stock_applied, stock_reversed, created_at,
        order_lines:order_lines (
          id, order_id, item_id, qty, unit, price_chf, created_at,
          item:items ( id, name, unit, current_stock )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    setOrders(data || []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      await Promise.all([loadItems(), loadOrders()]);
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, [loadItems, loadOrders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const draftTotals = useMemo(() => {
    const totalQty = draftLines.reduce((sum, l) => sum + Number(l.qty || 0), 0);
    const totalCHF = draftLines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.price_chf || 0), 0);
    return { totalQty, totalCHF };
  }, [draftLines]);

  function addDraftLine() {
    setErr("");
    const qty = Number(draftQty);
    if (!draftItemId) return setErr("Bitte zuerst einen Artikel wählen.");
    if (!Number.isFinite(qty) || qty <= 0) return setErr("Menge muss > 0 sein.");

    const it = items.find((x) => x.id === draftItemId);
    if (!it) return setErr("Artikel nicht gefunden.");

    const line = {
      tmp_id: crypto.randomUUID(),
      item_id: it.id,
      name: it.name,
      qty,
      unit: it.unit || "pcs",
      price_chf: Number(it.price || 0),
    };

    setDraftLines((prev) => [...prev, line]);
    setDraftItemId("");
    setDraftQty("1");
  }

  function removeDraftLine(tmpId) {
    setDraftLines((prev) => prev.filter((l) => l.tmp_id !== tmpId));
  }

  async function createOrder() {
    setErr("");
    setSuccessMsg("");
    if (draftLines.length === 0) return setErr("Noch keine Positionen.");

    setPosting(true);
    try {
      // 1) Order erstellen (status = open)
      const { data: created, error: orderErr } = await supabase
        .from("orders")
        .insert({
          status: "open",
          total_chf: draftTotals.totalCHF,
          stock_applied: false,
          stock_reversed: false,
        })
        .select("id")
        .single();

      if (orderErr) throw orderErr;

      // 2) Lines erstellen (snapshot: unit + price_chf)
      const linesPayload = draftLines.map((l) => ({
        order_id: created.id,
        item_id: l.item_id,
        qty: l.qty,
        unit: l.unit || "pcs",
        price_chf: Number(l.price_chf || 0),
      }));

      const { error: linesErr } = await supabase.from("order_lines").insert(linesPayload);
      if (linesErr) throw linesErr;

      // cleanup
      setDraftLines([]);
      setRetQty("1");
      setRetNote("");

      await loadOrders();
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setPosting(false);
    }
  }

  async function setStatus(orderId, status) {
    if (statusPostingRef.current) return;
    setErr("");
    setSuccessMsg("");
    statusPostingRef.current = true;
    setPosting(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId)
        .neq("status", status);
      if (error) throw error;
      await loadOrders();
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setPosting(false);
      statusPostingRef.current = false;
    }
  }

  function computeOrderTotals(o) {
    const lines = o.order_lines || [];
    const totalQty = lines.reduce((sum, l) => sum + Number(l.qty || 0), 0);
    const totalCHF = lines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.price_chf || 0), 0);
    return { totalQty, totalCHF };
  }

  function toggleExpanded(orderId) {
    setExpanded((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  }

  function selectLine(orderId, lineId) {
    setSelectedLineByOrder((prev) => ({ ...prev, [orderId]: lineId }));
  }

  async function bookRetour(order) {
    if (postingRef.current) return;
    postingRef.current = true;
    setErr("");
    setSuccessMsg("");
    const orderId = order.id;
    const lineId = selectedLineByOrder[orderId];
    if (!lineId) {
      postingRef.current = false;
      return setErr("Bitte zuerst eine Position auswählen.");
    }

    const qty = Number(retQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      postingRef.current = false;
      return setErr("Retour-Menge muss > 0 sein.");
    }

    const line = (order.order_lines || []).find((l) => l.id === lineId);
    if (!line) {
      postingRef.current = false;
      return setErr("Position nicht gefunden.");
    }

    setPosting(true);
    try {
      const note = (retNote || "").trim();
      const notesPayload = note ? `order:${order.id} line:${line.id} note:${note}` : `order:${order.id} line:${line.id}`;

      const { error: rpcErr } = await supabase.rpc("create_return_movement", {
        p_order_id: order.id,
        p_order_line_id: line.id,
        p_qty: qty,
        p_notes: notesPayload,
      });
      if (rpcErr) throw rpcErr;

      setRetQty("1");
      setRetNote("");
      setSuccessMsg("Retoure wurde erfolgreich gebucht.");

      await refresh();
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setPosting(false);
      postingRef.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Aufträge</h1>
          <p className="text-sm text-slate-400">Auftrag erstellen, erledigen, stornieren, Retoure buchen.</p>
        </div>

        <button
          onClick={refresh}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {successMsg}
        </div>
      )}

      {/* Create order */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="font-semibold">Neuen Auftrag erstellen</div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_auto_auto] md:items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Artikel wählen…</label>
            <select
              value={draftItemId}
              onChange={(e) => setDraftItemId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm outline-none focus:border-white/20"
            >
              <option value="">— bitte wählen —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({formatCHF(it.price)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Menge</label>
            <input
              value={draftQty}
              onChange={(e) => setDraftQty(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm outline-none focus:border-white/20"
              inputMode="numeric"
            />
          </div>

          <button
            disabled={posting}
            onClick={addDraftLine}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
          >
            Position hinzufügen
          </button>

          <button
            disabled={posting || draftLines.length === 0}
            onClick={createOrder}
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-60"
          >
            Auftrag speichern
          </button>
        </div>

        {draftLines.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400">Noch keine Positionen.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {draftLines.map((l) => (
              <div
                key={l.tmp_id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2"
              >
                <div className="text-sm text-slate-200">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-slate-400">
                    qty: {l.qty} {l.unit} • Preis: {formatCHF(l.price_chf)} • Position:{" "}
                    {formatCHF(Number(l.qty) * Number(l.price_chf))}
                  </div>
                </div>

                <button
                  onClick={() => removeDraftLine(l.tmp_id)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                >
                  Entfernen
                </button>
              </div>
            ))}

            <div className="mt-2 text-xs text-slate-400">
              Summe: <span className="text-slate-200">{draftTotals.totalQty}</span> pcs • Warenwert:{" "}
              <span className="text-slate-200">{formatCHF(draftTotals.totalCHF)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-slate-400">Lade…</div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-slate-400">Keine Aufträge.</div>
        ) : (
          orders.map((o) => {
            const st = statusLabel(o.status);
            const { totalQty, totalCHF } = computeOrderTotals(o);
            const isOpen = String(o.status || "open").toLowerCase() === "open";
            const isDone = String(o.status || "").toLowerCase() === "done";
            const isStorno = String(o.status || "").toLowerCase() === "storno";
            const isRetour = String(o.status || "").toLowerCase() === "retoure";

            return (
              <div
                key={o.id}
                className={`rounded-2xl border p-4 ${orderCardTone(o.status)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-semibold">{o.order_no || `AUF-${String(o.id).slice(0, 6)}`}</div>
                      <Badge tone={st.tone}>{st.text}</Badge>
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      Positionen: <span className="text-slate-200">{totalQty}</span> • Warenwert:{" "}
                      <span className="text-slate-200">{formatCHF(totalCHF)}</span>
                      {" • "}
                      stock_applied: {String(!!o.stock_applied)} | stock_reversed: {String(!!o.stock_reversed)}
                      {" • "}
                      {o.created_at ? new Date(o.created_at).toLocaleString("de-CH") : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpanded(o.id)}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                    >
                      {expanded[o.id] ? "Positionen ausblenden" : "Positionen anzeigen"}
                    </button>

                    <button
                      disabled={posting || isDone || isStorno}
                      onClick={() => setStatus(o.id, "done")}
                      className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                      title="Auftrag erledigen"
                    >
                      Erledigt
                    </button>

                    <button
                      disabled={posting || isStorno}
                      onClick={() => setStatus(o.id, "storno")}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
                      title="Auftrag stornieren"
                    >
                      Stornieren
                    </button>
                  </div>
                </div>

                {expanded[o.id] && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                    <div className="font-semibold mb-2">Positionen</div>

                    {(o.order_lines || []).length === 0 ? (
                      <div className="text-sm text-slate-400">Keine Positionen.</div>
                    ) : (
                      <div className="space-y-2">
                        {(o.order_lines || []).map((l) => {
                          const selected = selectedLineByOrder[o.id] === l.id;
                          return (
                            <div
                              key={l.id}
                              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                                selected
                                  ? "border-emerald-400/30 bg-emerald-500/10"
                                  : "border-white/10 bg-white/5"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate text-slate-200">
                                  {l.item?.name || "Artikel"} — qty: {Number(l.qty || 0)}
                                </div>
                                <div className="text-xs text-slate-400">
                                  preis: {formatCHF(l.price_chf)} | position total:{" "}
                                  {formatCHF(Number(l.qty || 0) * Number(l.price_chf || 0))} | lager:{" "}
                                  {Number(l.item?.current_stock || 0)} {l.item?.unit || l.unit || "pcs"}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  item_id: {l.item_id} • line_id: {l.id}
                                </div>
                              </div>

                              <button
                                onClick={() => selectLine(o.id, l.id)}
                                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                              >
                                {selected ? "Ausgewählt" : "Auswählen"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Retour */}
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="font-semibold">Retoure buchen</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Hinweis: Die DB verhindert automatisch, dass du mehr retournierst als ausgeliefert wurde.
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr_auto] md:items-end">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Menge</label>
                          <input
                            value={retQty}
                            onChange={(e) => setRetQty(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm outline-none focus:border-white/20"
                            inputMode="numeric"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Notiz</label>
                          <input
                            value={retNote}
                            onChange={(e) => setRetNote(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm outline-none focus:border-white/20"
                            placeholder="z.B. beschädigt / Kunde retour"
                          />
                        </div>

                        <button
                          disabled={posting || isStorno || isOpen || (o.order_lines || []).length === 0}
                          onClick={() => bookRetour(o)}
                          className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                        >
                          Retoure buchen
                        </button>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        Retour ist sinnvoll nach „Erledigt“ (Ausgang gebucht). Bei „Offen“ blocke ich’s bewusst.
                      </div>
                    </div>

                    {(isRetour || isDone || isStorno) && (
                      <div className="mt-3 text-xs text-slate-400">
                        Status-Info: {isRetour ? "Retoure erfasst." : isDone ? "Auftrag erledigt." : "Auftrag storniert."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
