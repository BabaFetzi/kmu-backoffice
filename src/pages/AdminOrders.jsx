import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("de-CH");
  } catch {
    return ts;
  }
}

const STATUS_OPTIONS = ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"];

export default function AdminOrders() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [openOrder, setOpenOrder] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [items, setItems] = useState([]);

  // Admin-Notiz UI-State
  const [adminNote, setAdminNote] = useState("");
  const [savingAdminNote, setSavingAdminNote] = useState(false);

  async function loadOrders() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("orders")
      .select(
        // ✅ admin_note hier mitladen
        "id, order_number, buyer_name, buyer_email, practice_firm, note, admin_note, total_chf, status, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setErr(error.message || "Fehler beim Laden der Bestellungen.");
      setOrders([]);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return orders.filter((o) => {
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (!needle) return true;

      const hay = [
        o.order_number,
        o.buyer_name,
        o.buyer_email,
        o.practice_firm,
        o.note,
        o.admin_note, // ✅ admin_note in Suche
        o.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [orders, q, statusFilter]);

  async function updateStatus(orderId, nextStatus) {
    // Optimistisches UI
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );

    const { error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId);

    if (error) {
      console.error(error);
      alert("Status-Update fehlgeschlagen. Details in F12 -> Console.");
      loadOrders();
    }
  }

  async function openDetails(order) {
    setOpenOrder(order);
    setAdminNote(order.admin_note ?? ""); // ✅ Admin-Notiz ins Feld laden

    setItems([]);
    setItemsLoading(true);

    const { data, error } = await supabase
      .from("order_items")
      .select(
        "id, order_id, product_name, unit_price_chf, qty, line_total_chf, created_at"
      )
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      alert("Positionen konnten nicht geladen werden. F12 -> Console.");
      setItems([]);
    } else {
      setItems(data || []);
    }

    setItemsLoading(false);
  }

  async function saveAdminNote() {
    if (!openOrder) return;

    setSavingAdminNote(true);
    try {
      const clean = adminNote.trim();

      const { data, error } = await supabase
        .from("orders")
        .update({ admin_note: clean ? clean : null })
        .eq("id", openOrder.id)
        .select(
          "id, order_number, buyer_name, buyer_email, practice_firm, note, admin_note, total_chf, status, created_at"
        )
        .single();

      if (error) throw error;

      // ✅ UI: openOrder updaten
      setOpenOrder(data);

      // ✅ UI: Liste updaten
      setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));

    } catch (e) {
      console.error(e);
      alert("Admin-Notiz konnte nicht gespeichert werden. Details in F12 -> Console.");
    } finally {
      setSavingAdminNote(false);
    }
  }

  function badgeClass(status) {
    if (status === "NEW") return "bg-blue-50 text-blue-700 border-blue-200";
    if (status === "IN_PROGRESS")
      return "bg-yellow-50 text-yellow-800 border-yellow-200";
    if (status === "DONE") return "bg-green-50 text-green-700 border-green-200";
    if (status === "CANCELLED")
      return "bg-red-50 text-red-700 border-red-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bestellungen</h1>
            <p className="text-sm text-gray-600 mt-1">
              Übersicht (orders) + Details (order_items). Neueste zuerst.
            </p>
          </div>

          <button
            onClick={loadOrders}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
          >
            Neu laden
          </button>
        </div>

        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <input
            className="sm:col-span-2 w-full px-3 py-2 rounded-lg border bg-white"
            placeholder="Suche: Bestellnummer, Name, Praxisfirma, Mail, Notiz..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="w-full px-3 py-2 rounded-lg border bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Alle Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="text-gray-600">Lade Bestellungen...</div>
          ) : err ? (
            <div className="p-4 rounded-xl border bg-white">
              <div className="font-semibold text-red-600">Fehler</div>
              <div className="text-sm text-gray-700 mt-1">{err}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-gray-600">Keine Bestellungen gefunden.</div>
          ) : (
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left">
                      <th className="p-3">Zeit</th>
                      <th className="p-3">Bestellnr.</th>
                      <th className="p-3">Praxisfirma</th>
                      <th className="p-3">Kunde</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Status</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => (
                      <tr key={o.id} className="border-b last:border-b-0">
                        <td className="p-3 whitespace-nowrap">
                          {formatDate(o.created_at)}
                        </td>
                        <td className="p-3 font-semibold whitespace-nowrap">
                          {o.order_number}
                        </td>
                        <td className="p-3">{o.practice_firm}</td>
                        <td className="p-3">
                          <div className="font-medium">{o.buyer_name}</div>
                          <div className="text-gray-600">{o.buyer_email}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap font-semibold">
                          {formatCHF(o.total_chf)}
                        </td>
                        <td className="p-3">
                          <span
                            className={
                              "inline-flex items-center px-2 py-1 rounded-full border text-xs font-semibold " +
                              badgeClass(o.status)
                            }
                          >
                            {o.status}
                          </span>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => updateStatus(o.id, "NEW")}
                              className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                            >
                              NEW
                            </button>
                            <button
                              onClick={() => updateStatus(o.id, "IN_PROGRESS")}
                              className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                            >
                              IN_PROGRESS
                            </button>
                            <button
                              onClick={() => updateStatus(o.id, "DONE")}
                              className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                            >
                              DONE
                            </button>
                            <button
                              onClick={() => updateStatus(o.id, "CANCELLED")}
                              className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 text-xs"
                            >
                              CANCELLED
                            </button>
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <button
                            onClick={() => openDetails(o)}
                            className="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DETAILS MODAL */}
      {openOrder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Bestellung</div>
                <div className="text-lg font-bold truncate">
                  {openOrder.order_number}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {openOrder.practice_firm} • {openOrder.buyer_name} •{" "}
                  {openOrder.buyer_email}
                </div>

                {/* Kunden-Notiz */}
                {openOrder.note && (
                  <div className="text-sm mt-2 p-3 rounded-xl bg-gray-50 border">
                    <div className="text-xs text-gray-500 mb-1">Kunden-Notiz</div>
                    {openOrder.note}
                  </div>
                )}

                {/* ✅ Admin-Notiz */}
                <div className="text-sm mt-3 p-3 rounded-xl bg-white border">
                  <div className="text-xs text-gray-500 mb-2">Admin-Notiz (intern)</div>
                  <textarea
                    className="w-full px-3 py-2 rounded-lg border"
                    rows={3}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Interne Notiz für Admin…"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={saveAdminNote}
                      disabled={savingAdminNote}
                      className="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                      {savingAdminNote ? "Speichere..." : "Admin-Notiz speichern"}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setOpenOrder(null)}
                className="px-3 py-2 rounded-lg border hover:bg-gray-50"
              >
                Schliessen
              </button>
            </div>

            <div className="p-4">
              {itemsLoading ? (
                <div className="text-gray-600">Lade Positionen...</div>
              ) : items.length === 0 ? (
                <div className="text-gray-600">
                  Keine Positionen gefunden (order_items leer?).
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr className="text-left">
                        <th className="p-3">Artikel</th>
                        <th className="p-3">Preis</th>
                        <th className="p-3">Menge</th>
                        <th className="p-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className="border-b last:border-b-0">
                          <td className="p-3 font-medium">{it.product_name}</td>
                          <td className="p-3 whitespace-nowrap">
                            {formatCHF(it.unit_price_chf)}
                          </td>
                          <td className="p-3">{it.qty}</td>
                          <td className="p-3 whitespace-nowrap font-semibold">
                            {formatCHF(it.line_total_chf)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Erstellt:{" "}
                  <b className="text-gray-900">{formatDate(openOrder.created_at)}</b>
                </div>
                <div className="text-sm">
                  Total:{" "}
                  <b className="text-gray-900">{formatCHF(openOrder.total_chf)}</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
