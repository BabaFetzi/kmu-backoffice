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

export default function AdminProducts() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL"); // ALL | ACTIVE | INACTIVE

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceChf, setPriceChf] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);
  const [stockQty, setStockQty] = useState("0");

  async function loadProducts() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, description, price_chf, image_url, active, stock_qty, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setErr(error.message || "Fehler beim Laden der Produkte.");
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return rows.filter((p) => {
      if (activeFilter === "ACTIVE" && !p.active) return false;
      if (activeFilter === "INACTIVE" && p.active) return false;

      if (!needle) return true;

      const hay = [p.sku, p.name, p.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [rows, q, activeFilter]);

  function openNew() {
    setEditingId(null);
    setSku("");
    setName("");
    setDescription("");
    setPriceChf("");
    setImageUrl("");
    setActive(true);
    setStockQty("0");
    setModalOpen(true);
  }

  function openEdit(p) {
    setEditingId(p.id);
    setSku(p.sku || "");
    setName(p.name || "");
    setDescription(p.description || "");
    setPriceChf(String(p.price_chf ?? ""));
    setImageUrl(p.image_url || "");
    setActive(!!p.active);
    setStockQty(String(p.stock_qty ?? 0));
    setModalOpen(true);
  }

  async function saveProduct() {
    setErr("");

    if (!sku.trim() || !name.trim()) {
      return alert("Bitte SKU und Name ausfüllen.");
    }

    const price = Number(String(priceChf).replace(",", "."));
    if (Number.isNaN(price) || price < 0) {
      return alert("Bitte einen gültigen Preis (CHF) eingeben.");
    }

    const stock = Number(String(stockQty).trim());
    if (!Number.isInteger(stock) || stock < 0) {
      return alert("Bitte einen gültigen Lagerbestand (Ganzzahl >= 0) eingeben.");
    }

    setSaving(true);
    try {
      const payload = {
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim() || null,
        price_chf: price,
        image_url: imageUrl.trim() || null,
        active: !!active,
        stock_qty: stock,
      };

      if (!editingId) {
        const { error } = await supabase.from("products").insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      }

      setModalOpen(false);
      await loadProducts();
    } catch (e) {
      console.error(e);
      alert("Speichern fehlgeschlagen. Details in F12 -> Console.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p) {
    setRows((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));

    const { error } = await supabase.from("products").update({ active: !p.active }).eq("id", p.id);

    if (error) {
      console.error(error);
      alert("Änderung fehlgeschlagen. Details in F12 -> Console.");
      loadProducts();
    }
  }

  async function archiveProduct(p) {
    if (!confirm(`Produkt "${p.name}" wirklich deaktivieren (archivieren)?`)) return;

    const { error } = await supabase.from("products").update({ active: false }).eq("id", p.id);

    if (error) {
      console.error(error);
      alert("Archivieren fehlgeschlagen. Details in F12 -> Console.");
    } else {
      loadProducts();
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Produkte</h1>
            <p className="text-sm text-gray-600 mt-1">
              Produkte anlegen, bearbeiten, aktivieren/deaktivieren, Lagerbestand pflegen.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={loadProducts}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
            >
              Neu laden
            </button>
            <button
              onClick={openNew}
              className="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
            >
              + Neues Produkt
            </button>
          </div>
        </div>

        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <input
            className="sm:col-span-2 w-full px-3 py-2 rounded-lg border bg-white"
            placeholder="Suche: SKU, Name, Beschreibung..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="w-full px-3 py-2 rounded-lg border bg-white"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
          >
            <option value="ALL">Alle</option>
            <option value="ACTIVE">Nur aktiv</option>
            <option value="INACTIVE">Nur inaktiv</option>
          </select>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="text-gray-600">Lade Produkte...</div>
          ) : err ? (
            <div className="p-4 rounded-xl border bg-white">
              <div className="font-semibold text-red-600">Fehler</div>
              <div className="text-sm text-gray-700 mt-1">{err}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-gray-600">Keine Produkte gefunden.</div>
          ) : (
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left">
                      <th className="p-3">SKU</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Preis</th>
                      <th className="p-3">Bestand</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Erstellt</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="p-3 whitespace-nowrap text-gray-700 font-medium">
                          {p.sku}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold">{p.name}</div>
                          {p.description && (
                            <div className="text-gray-600 text-xs mt-1 line-clamp-2">
                              {p.description}
                            </div>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap font-semibold">
                          {formatCHF(p.price_chf)}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="inline-flex px-2 py-1 rounded-full border text-xs font-semibold bg-gray-50 text-gray-800 border-gray-200">
                            {Number(p.stock_qty ?? 0)}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => toggleActive(p)}
                            className={
                              "px-2 py-1 rounded-full border text-xs font-semibold " +
                              (p.active
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-gray-50 text-gray-700 border-gray-200")
                            }
                          >
                            {p.active ? "AKTIV" : "INAKTIV"}
                          </button>
                        </td>
                        <td className="p-3 whitespace-nowrap text-gray-600">
                          {formatDate(p.created_at)}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => openEdit(p)}
                              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => archiveProduct(p)}
                              className="px-3 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600"
                            >
                              Deaktivieren
                            </button>
                          </div>
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

      {/* MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">
                {editingId ? "Produkt bearbeiten" : "Neues Produkt"}
              </div>
              <button
                className="px-3 py-2 rounded-lg border hover:bg-gray-50"
                onClick={() => setModalOpen(false)}
              >
                Schliessen
              </button>
            </div>

            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <input
                className="w-full px-3 py-2 rounded-lg border"
                placeholder="SKU (z.B. NK-OC450-MS)"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
              <input
                className="w-full px-3 py-2 rounded-lg border"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <input
                className="w-full px-3 py-2 rounded-lg border"
                placeholder="Preis CHF (z.B. 29.90)"
                value={priceChf}
                onChange={(e) => setPriceChf(e.target.value)}
              />

              <input
                className="w-full px-3 py-2 rounded-lg border"
                placeholder="Bestand (Ganzzahl, z.B. 10)"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
              />

              <label className="sm:col-span-2 flex items-center gap-2 px-3 py-2 rounded-lg border bg-white">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <span className="text-sm">Aktiv (im Shop sichtbar)</span>
              </label>

              <input
                className="sm:col-span-2 w-full px-3 py-2 rounded-lg border"
                placeholder="Bild-URL (optional)"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />

              {imageUrl?.trim() && (
                <div className="sm:col-span-2 border rounded-xl p-3 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">Vorschau</div>
                  <img
                    src={imageUrl}
                    alt="preview"
                    className="max-h-40 rounded-lg border bg-white"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              )}

              <textarea
                className="sm:col-span-2 w-full px-3 py-2 rounded-lg border"
                rows={4}
                placeholder="Beschreibung (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <button
                disabled={saving}
                onClick={saveProduct}
                className="sm:col-span-2 w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 disabled:opacity-60"
              >
                {saving ? "Speichere..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
