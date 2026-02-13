import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

export default function Settings() {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [row, setRow] = useState(null);
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("CH");
  const [vatUid, setVatUid] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  async function load() {
    setErr("");
    setSuccess("");
    try {
      const { data, error } = await supabase
        .from("company_profile")
        .select(
          "id, legal_name, trading_name, street, street2, zip, city, country, vat_uid, iban, bank_name, email, phone"
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      setRow(data || null);
      if (data) {
        setLegalName(data.legal_name || "");
        setTradingName(data.trading_name || "");
        setStreet(data.street || "");
        setStreet2(data.street2 || "");
        setZip(data.zip || "");
        setCity(data.city || "");
        setCountry(data.country || "CH");
        setVatUid(data.vat_uid || "");
        setIban(data.iban || "");
        setBankName(data.bank_name || "");
        setEmail(data.email || "");
        setPhone(data.phone || "");
      }
    } catch (e) {
      setErr(prettySupabaseError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setErr("");
    setSuccess("");

    if (!legalName.trim()) return setErr("Rechtlicher Name fehlt.");
    if (!street.trim() || !zip.trim() || !city.trim()) return setErr("Adresse ist unvollständig.");

    const payload = {
      legal_name: legalName.trim(),
      trading_name: tradingName.trim() || null,
      street: street.trim(),
      street2: street2.trim() || null,
      zip: zip.trim(),
      city: city.trim(),
      country: country.trim() || "CH",
      vat_uid: vatUid.trim() || null,
      iban: iban.trim() || null,
      bank_name: bankName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
    };

    setSaving(true);
    try {
      if (!row) {
        const { error } = await supabase.from("company_profile").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_profile").update(payload).eq("id", row.id);
        if (error) throw error;
      }
      await load();
      setSuccess("Gespeichert.");
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Stammdaten</h1>
        <p className="text-sm text-slate-500">Firmendaten für gesetzeskonforme Rechnungen (CH).</p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {row ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Gespeicherte Stammdaten</div>
          </div>
          <div className="mt-2 text-sm text-slate-700">
            <div className="font-medium">{row.legal_name}{row.trading_name ? ` (${row.trading_name})` : ""}</div>
            <div className="mt-1">
              {row.street}{row.street2 ? `, ${row.street2}` : ""}<br />
              {row.zip} {row.city} · {row.country}
            </div>
            <div className="mt-2">
              {row.vat_uid ? <>MWST‑UID: <span className="text-slate-900">{row.vat_uid}</span></> : "MWST‑UID: —"}
            </div>
            <div className="mt-1">
              {row.iban ? <>IBAN: <span className="text-slate-900">{row.iban}</span></> : "IBAN: —"}
            </div>
            <div className="mt-1">
              {row.bank_name ? <>Bank: <span className="text-slate-900">{row.bank_name}</span></> : "Bank: —"}
            </div>
            <div className="mt-2">
              {row.email ? <>E‑Mail: <span className="text-slate-900">{row.email}</span></> : "E‑Mail: —"}
            </div>
            <div className="mt-1">
              {row.phone ? <>Telefon: <span className="text-slate-900">{row.phone}</span></> : "Telefon: —"}
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Rechtlicher Name *</label>
            <input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="Musterfirma AG"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Handelsname (optional)</label>
            <input
              value={tradingName}
              onChange={(e) => setTradingName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="Musterfirma"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Strasse *</label>
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="Hauptstrasse 1"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Adresszusatz</label>
            <input
              value={street2}
              onChange={(e) => setStreet2(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="c/o ..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">PLZ *</label>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="8000"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Ort *</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="Zürich"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Land *</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="CH"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">MWST‑UID</label>
            <input
              value={vatUid}
              onChange={(e) => setVatUid(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="CHE-123.456.789 MWST"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">IBAN</label>
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="CH93 0076 2011 6238 5295 7"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Bank</label>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="ZKB"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">E‑Mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="info@firma.ch"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Telefon</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
              placeholder="+41 44 000 00 00"
            />
          </div>
          <div />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-60"
          >
            {saving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </form>

    </div>
  );
}
