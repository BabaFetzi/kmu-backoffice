import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Zeigt die letzten Bewegungen eines Artikels (wann / wie / wieso).
 * - OUT / IN / ADJUST etc.
 * - reason, reference, notes
 * - optional: filterbar
 */
export default function ItemMovementsPanel({ itemId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (!itemId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, limit]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, created_at, movement_type, qty, unit, reason, reference, notes, order_id, order_line_id"
        )
        .eq("item_id", itemId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!itemId) {
    return (
      <div style={{ opacity: 0.7 }}>
        Wähle einen Artikel aus, um Bewegungen zu sehen.
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #334155", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>Bewegungen (wann / wie / wieso)</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Anzahl:</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>

          <button onClick={load} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #b91c1c", color: "#ef4444" }}>
          {err}
        </div>
      ) : null}

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {rows.length === 0 && !loading ? (
          <div style={{ opacity: 0.7 }}>Keine Bewegungen gefunden.</div>
        ) : null}

        {rows.map((m) => (
          <div key={m.id} style={{ border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 900 }}>
                {String(m.movement_type || "").toUpperCase()} {m.qty} {m.unit || ""}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.8 }}>
                {m.created_at ? new Date(m.created_at).toLocaleString() : "-"}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
              <b>reason:</b> {m.reason || "-"} &nbsp;|&nbsp; <b>reference:</b>{" "}
              <span style={{ fontFamily: "monospace" }}>{m.reference || "-"}</span>
            </div>

            {m.notes ? (
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                <b>notes:</b> {m.notes}
              </div>
            ) : null}

            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
              order_id: {m.order_id || "-"} | order_line_id: {m.order_line_id || "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
