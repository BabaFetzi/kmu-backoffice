import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("de-CH");
  } catch {
    return ts;
  }
}

const EMPTY = {
  id: null,
  name: "",
  email: "",
  phone: "",
  practice_firm: "",
  address1: "",
  address2: "",
  zip: "",
  city: "",
  country: "CH",
  note: "",
};

export default function AdminCustomers() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  async function loadCustomers() {
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, name, email, phone, practice_firm, address1, address2, zip, city, country, note, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setErr(error.message || "Fehler beim Laden der Kunden.");
      setCustomers([]);
    } else {
      setCustomers(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;

    return customers.filter((c) => {
      const hay = [
        c.name,
        c.email,
        c.phone,
        c.practice_firm,
        c.address1,
        c.address2,
        c.zip,
        c.city,
        c.country,
        c.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [customers, q]);

  function openNew() {
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(c) {
    setForm({
      id: c.id,
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      practice_firm: c.practice_firm || "",
      address1: c.address1 || "",
      address2: c.address2 || "",
      zip: c.zip || "",
      city: c.city || "",
      country: c.country || "CH",
      note: c.note || "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSaving(false);
    setForm(EMPTY);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveCustomer() {
    setErr("");
    if (!form.name.trim()) {
      alert("Bitte Name ausfüllen.");
      return;
    }

    setSaving(true);

    try {
      if (form.id) {
        // Update
        const { error } = await supabase
          .from("customers")
          .update({
            name: form.name.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            practice_firm: form.practice_firm.trim() || null,
            address1: form.address1.trim() || null,
            address2: form.address2.trim() || null,
            zip: form.zip.trim() || null,
            city: form.city.trim() || null,
            country: form.country.trim() || "CH",
            note: form.note.trim() || null,
          })
          .eq("id", form.id);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from("customers").insert([
          {
            name: form.name.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            practice_firm: form.practice_firm.trim() || null,
            address1: form.address1.trim() || null,
            address2: form.address2.trim() || null,
            zip: form.zip.trim() || null,
            city: form.city.trim() || null,
            country: form.country.trim() || "CH",
            note: form.note.trim() || null,
          },
        ]);

        if (error) throw error;
      }

      await loadCustomers();
      closeModal();
    } catch (e) {
      console.error(e);
      alert("Speichern fehlgeschlagen. Details in F12 -> Console.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(id) {
    const ok = confirm("Kunde wirklich löschen?");
    if (!ok) return;

    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      await loadCustomers();
    } catch (e) {
      console.error(e);
      alert("Löschen fehlgeschlagen. Details in F12 -> Console.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Kunden</h1>
            <p className="text-sm text-gray-600 mt-1">
              CRM light: Kunden anlegen, bearbeiten, suchen.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={loadCustomers}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
            >
              Neu laden
            </button>
            <button
              onClick={openNew}
              className="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
            >
              + Neuer Kunde
            </button>
          </div>
        </div>

        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <input
            className="sm:col-span-3 w-full px-3 py-2 rounded-lg border bg-white"
            placeholder="Suche: Name, Mail, Firma, Adresse, Notiz..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="text-gray-600">Lade Kunden...</div>
          ) : err ? (
            <div className="p-4 rounded-xl border bg-white">
              <div className="font-semibold text-red-600">Fehler</div>
              <div className="text-sm text-gray-700 mt-1">{err}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-gray-600">Keine Kunden gefunden.</div>
          ) : (
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left">
                      <th className="p-3">Name</th>
                      <th className="p-3">Praxisfirma</th>
                      <th className="p-3">Kontakt</th>
                      <th className="p-3">Ort</th>
                      <th className="p-3">Erstellt</th>
                      <th className="p-3 w-44"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-b last:border-b-0">
                        <td className="p-3 font-semibold">{c.name}</td>
                        <td className="p-3">{c.practice_firm || "-"}</td>
                        <td className="p-3">
                          <div className="text-gray-900">{c.email || "-"}</div>
                          <div className="text-gray-600">{c.phone || ""}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-gray-900">
                            {(c.zip || "") + " " + (c.city || "")}
                          </div>
                          <div className="text-gray-600">{c.country || ""}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap text-gray-700">
                          {formatDate(c.created_at)}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => openEdit(c)}
                              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => deleteCustomer(c.id)}
                              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-red-600"
                            >
                              Löschen
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
          <div className="w-full max-w-3xl bg-white rounded-2xl border overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-gray-500">Kunde</div>
                <div className="text-lg font-bold">
                  {form.id ? "Bearbeiten" : "Neu anlegen"}
                </div>
              </div>

              <button
                onClick={closeModal}
                className="px-3 py-2 rounded-lg border hover:bg-gray-50"
              >
                Schliessen
              </button>
            </div>

            <div className="p-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  className="w-full px-3 py-2 rounded-lg border"
                  placeholder="Name *"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
                <input
                  className="w-full px-3 py-2 rounded-lg border"
                  placeholder="Praxisfirma"
                  value={form.practice_firm}
                  onChange={(e) => setField("practice_firm", e.target.value)}
                />

                <input
                  className="w-full px-3 py-2 rounded-lg border"
                  placeholder="E-Mail"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
                <input
                  className="w-full px-3 py-2 rounded-lg border"
                  placeholder="Telefon"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />

                <input
                  className="sm:col-span-2 w-full px-3 py-2 rounded-lg border"
                  placeholder="Adresse 1"
                  value={form.address1}
                  onChange={(e) => setField("address1", e.target.value)}
                />
                <input
                  className="sm:col-span-2 w-full px-3 py-2 rounded-lg border"
                  placeholder="Adresse 2"
                  value={form.address2}
                  onChange={(e) => setField("address2", e.target.value)}
                />

                <input
                  className="w-full px-3 py-2 rounded-lg border"
                  placeholder="PLZ"
                  value={form.zip}
                  onChange={(e) => setField("zip", e.target.value)}
                />
                <input
                  className="w-full px-3 py-2 rounded-lg border"
                  placeholder="Ort"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
                <input
                  className="w-full px-3 py-2 rounded-lg border"
                  placeholder="Land"
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                />

                <textarea
                  className="sm:col-span-2 w-full px-3 py-2 rounded-lg border"
                  placeholder="Notiz (intern)"
                  rows={4}
                  value={form.note}
                  onChange={(e) => setField("note", e.target.value)}
                />
              </div>

              <button
                disabled={saving}
                onClick={saveCustomer}
                className="mt-4 w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 disabled:opacity-60"
              >
                {saving ? "Speichere..." : "Speichern"}
              </button>

              <div className="mt-2 text-xs text-gray-500">
                * Pflichtfeld
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
