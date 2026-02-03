import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Movements() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [q, setQ] = useState(""); // search by item name or reference

  async function loadMovements() {
    setLoading(true);
    setErr("");
    try {
      // Wir joinen Items, damit du den Artikelnamen siehst
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, created_at, movement_type, qty, unit, reason, reference, notes, item_id, order_id, order_line_id, items(name)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // simple client-side filter (später kann man server-side bauen)
      const filtered = (data || []).filter((r) => {
        const name = r.items?.name || "";
        const ref = r.reference || "";
        const reason = r.reason || "";
        const notes = r.notes || "";
        const s = `${name} ${ref} ${reason} ${notes}`.toLowerCase();
        return !q.trim() || s.includes(q.trim().toLowerCase());
      });

      setRows(filtered);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h2>Stock Movements (Journal)</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={loadMovements} disabled={loading}>
          {loading ? "Lade…" : "Refresh"}
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche: Artikelname, AUF-Nummer, reason, Notiz…"
          style={{ minWidth: 320 }}
        />

        <button onClick={loadMovements} disabled={loading}>
          Anwenden
        </button>
      </div>

      {err ? (
        <div style={{ padding: 10, border: "1px solid #b00020", color: "#b00020" }}>
          {err}
        </div>
      ) : null}

      <div style={{ border: "1px solid #333", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "180px 80px 80px 90px 140px 220px 1fr", gap: 0, background: "#111827", padding: 10, fontWeight: 800 }}>
          <div>Datum</div>
          <div>Typ</div>
          <div>Menge</div>
          <div>Einheit</div>
          <div>Artikel</div>
          <div>Reference</div>
          <div>Wieso (reason/notes)</div>
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "180px 80px 80px 90px 140px 220px 1fr",
              padding: 10,
              borderTop: "1px solid #222",
              alignItems: "center",
              gap: 0,
            }}
          >
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>
              {new Date(r.created_at).toLocaleString()}
            </div>
            <div style={{ fontWeight: 700 }}>{r.movement_type}</div>
            <div>{r.qty}</div>
            <div>{r.unit}</div>
            <div>{r.items?.name || "-"}</div>
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>{r.reference || "-"}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              <div><b>{r.reason || "-"}</b></div>
              <div style={{ opacity: 0.8 }}>{r.notes || ""}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
