import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
}

function makeOrderNumber() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `BO-${y}${m}${day}-${hh}${mm}${ss}`;
}

export default function Shop() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [products, setProducts] = useState([]);

  // Cart: [{ product_id, sku, name, price_chf, qty }]
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState([]);

  // Checkout fields
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [practiceFirm, setPracticeFirm] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadProducts() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, description, price_chf, image_url, active, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setErr(error.message || "Fehler beim Laden der Produkte.");
      setProducts([]);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
    // Email automatisch aus Session ziehen (falls eingeloggt)
    supabase.auth.getUser().then(({ data }) => {
      const email = data?.user?.email || "";
      if (email) setBuyerEmail(email);
    });
  }, []);

  const cartCount = useMemo(
    () => cart.reduce((sum, it) => sum + (it.qty || 0), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, it) => sum + (Number(it.price_chf) || 0) * (it.qty || 0), 0),
    [cart]
  );

  function addToCart(p) {
    // p muss id enthalten!
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          sku: p.sku,
          name: p.name,
          price_chf: p.price_chf,
          qty: 1,
        },
      ];
    });
    setCartOpen(true);
  }

  function inc(product_id) {
    setCart((prev) =>
      prev.map((x) => (x.product_id === product_id ? { ...x, qty: x.qty + 1 } : x))
    );
  }

  function dec(product_id) {
    setCart((prev) =>
      prev
        .map((x) => (x.product_id === product_id ? { ...x, qty: Math.max(1, x.qty - 1) } : x))
        .filter((x) => x.qty > 0)
    );
  }

  function remove(product_id) {
    setCart((prev) => prev.filter((x) => x.product_id !== product_id));
  }

  function clearCart() {
    setCart([]);
  }

  async function placeOrder() {
    setErr("");

    if (cart.length === 0) return alert("Warenkorb ist leer.");
    if (!buyerName.trim()) return alert("Bitte Name ausfüllen.");
    if (!buyerEmail.trim()) return alert("Bitte E-Mail ausfüllen.");
    if (!practiceFirm.trim()) return alert("Bitte Praxisfirma ausfüllen.");

    // Extra Schutz: product_id darf nie fehlen
    const bad = cart.find((x) => !x.product_id);
    if (bad) {
      console.error("Cart item without product_id:", bad);
      return alert("Fehler: Produkt-ID fehlt im Warenkorb. Bitte Seite neu laden.");
    }

    setSaving(true);

    try {
      const orderNumber = makeOrderNumber();
      const total = Number(cartTotal.toFixed(2));

      // 1) Order anlegen
      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert([
          {
            order_number: orderNumber,
            buyer_name: buyerName.trim(),
            buyer_email: buyerEmail.trim(),
            practice_firm: practiceFirm.trim(),
            note: note.trim() || null,
            total_chf: total,
            status: "NEW",
          },
        ])
        .select("id, order_number")
        .single();

      if (orderErr) throw orderErr;

      // 2) Order Items anlegen (mit product_id!)
      const itemsPayload = cart.map((it) => ({
        order_id: orderRow.id,
        product_id: it.product_id,
        product_name: it.name,
        unit_price_chf: Number(it.price_chf || 0),
        qty: Number(it.qty || 0),
        line_total_chf: Number((Number(it.price_chf || 0) * Number(it.qty || 0)).toFixed(2)),
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      alert(`Bestellung gespeichert: ${orderRow.order_number}`);
      clearCart();
      setCartOpen(false);
      setNote("");
    } catch (e) {
      console.error(e);
      alert("Bestellung fehlgeschlagen. Details in F12 -> Console.");
      setErr(e?.message || "Bestellung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="bg-yellow-100 border-b border-yellow-200 text-yellow-900 text-sm">
        <div className="max-w-6xl mx-auto px-4 py-2">
          Interner Übungsshop – nur für Praxisfirmen. Keine echten Verkäufe.
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">BackOffice Shop</h1>
            <p className="text-sm text-gray-600 mt-1">Produkte aus Supabase</p>
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
          >
            Warenkorb <span className="ml-2 inline-flex px-2 py-0.5 rounded-full bg-white/15">{cartCount}</span>
          </button>
        </div>

        {err && (
          <div className="mt-4 p-4 rounded-xl border bg-white">
            <div className="font-semibold text-red-600">Fehler</div>
            <div className="text-sm text-gray-700 mt-1">{err}</div>
          </div>
        )}

        <div className="mt-6">
          <h2 className="font-semibold">Produkte</h2>

          {loading ? (
            <div className="text-gray-600 mt-3">Lade Produkte...</div>
          ) : products.length === 0 ? (
            <div className="text-gray-600 mt-3">Keine Produkte gefunden (aktiv?).</div>
          ) : (
            <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((p) => (
                <div key={p.id} className="bg-white border rounded-2xl p-4">
                  <div className="text-xs text-gray-500">{p.sku}</div>
                  <div className="font-bold mt-1">{p.name}</div>
                  {p.description && (
                    <div className="text-sm text-gray-600 mt-1 line-clamp-3">{p.description}</div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-semibold">{formatCHF(p.price_chf)}</div>
                    <button
                      onClick={() => addToCart(p)}
                      className="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
                    >
                      In den Warenkorb
                    </button>
                  </div>

                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="mt-3 w-full max-h-48 object-contain rounded-xl border bg-white"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CART MODAL */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Warenkorb</div>
              <button className="px-3 py-2 rounded-lg border hover:bg-gray-50" onClick={() => setCartOpen(false)}>
                Schliessen
              </button>
            </div>

            <div className="p-4">
              {cart.length === 0 ? (
                <div className="text-gray-600">Warenkorb ist leer.</div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.map((it) => (
                      <div key={it.product_id} className="border rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{it.name}</div>
                          <div className="text-xs text-gray-600">{formatCHF(it.price_chf)} / Stück</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button className="px-2 py-1 rounded border" onClick={() => dec(it.product_id)}>-</button>
                          <div className="w-8 text-center">{it.qty}</div>
                          <button className="px-2 py-1 rounded border" onClick={() => inc(it.product_id)}>+</button>

                          <button
                            className="ml-2 px-3 py-2 rounded-lg border text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => remove(it.product_id)}
                          >
                            Entfernen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm">
                      Total: <b>{formatCHF(cartTotal)}</b>
                    </div>
                    <button className="px-3 py-2 rounded-lg border hover:bg-gray-50" onClick={clearCart}>
                      Warenkorb leeren
                    </button>
                  </div>

                  <div className="mt-4 grid sm:grid-cols-2 gap-3">
                    <input
                      className="w-full px-3 py-2 rounded-lg border"
                      placeholder="Name"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                    />
                    <input
                      className="w-full px-3 py-2 rounded-lg border"
                      placeholder="E-Mail"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                    />
                    <input
                      className="sm:col-span-2 w-full px-3 py-2 rounded-lg border"
                      placeholder="Praxisfirma"
                      value={practiceFirm}
                      onChange={(e) => setPracticeFirm(e.target.value)}
                    />
                    <textarea
                      className="sm:col-span-2 w-full px-3 py-2 rounded-lg border"
                      rows={3}
                      placeholder="Notiz (optional)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  <button
                    disabled={saving}
                    onClick={placeOrder}
                    className="mt-4 w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 disabled:opacity-60"
                  >
                    {saving ? "Speichere Bestellung..." : "Bestellung speichern"}
                  </button>

                  <div className="mt-2 text-xs text-gray-500">
                    Hinweis: Übungsshop – keine echten Zahlungen.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
