import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DunningLetterPreview from "../components/DunningLetterPreview";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

function formatCHF(value) {
  const n = Number(value || 0);
  return n.toLocaleString("de-CH", { style: "currency", currency: "CHF" });
}

function historyEventLabel(eventType) {
  if (eventType === "payment") return "Zahlung";
  if (eventType === "dunning") return "Mahnung";
  if (eventType === "order.finalized") return "Beleg erstellt";
  if (eventType === "order.cancelled_after_done") return "Gutschrift erstellt";
  if (eventType === "document.archived") return "Archiviert";
  if (eventType === "document.unarchived") return "Reaktiviert";
  return eventType || "Ereignis";
}

function historyEventText(row) {
  const detail = row?.detail || {};
  if (row?.event_type === "payment") {
    return `${formatCHF(detail.amount)}${detail.method ? ` (${detail.method})` : ""}`;
  }
  if (row?.event_type === "dunning") {
    return `Mahnstufe ${detail.level ?? "-"}${detail.note ? ` - ${detail.note}` : ""}`;
  }
  if (detail.note) return String(detail.note);
  if (detail.status) return `Status: ${detail.status}`;
  return "-";
}

function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["beleg_no", "typ", "auftrag_no", "kunde", "betrag", "datum"];
  const lines = [header.map(esc).join(",")];

  rows.forEach((r) => {
    const isCredit = r.document_type === "credit_note";
    const docNo = isCredit ? r.credit_note_no : r.invoice_no;
    const docDate = isCredit ? r.credit_note_date : r.invoice_date;
    const dateStr = docDate ? new Date(docDate).toLocaleDateString("de-CH") : "";
    const customer = r.customers?.company_name || "";
    lines.push(
      [
        docNo || "",
        isCredit ? "Gutschrift" : "Rechnung",
        r.order_no || "",
        customer,
        Number(r.gross_total || 0).toFixed(2),
        dateStr,
      ]
        .map(esc)
        .join(",")
    );
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Documents() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // invoice | credit_note | all
  const [statusFilter, setStatusFilter] = useState("all"); // open | partial | paid | overdue | all
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [archiveFilter, setArchiveFilter] = useState("active"); // active | archived | all
  const [noteDraftById, setNoteDraftById] = useState({});
  const [savingNoteId, setSavingNoteId] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [previewOpenId, setPreviewOpenId] = useState(null);
  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [pdfOrderId, setPdfOrderId] = useState(null);
  const [overdueBusy, setOverdueBusy] = useState(false);
  const [autoDunningBusy, setAutoDunningBusy] = useState(false);
  const printRef = useRef(null);
  const deferredQ = useDeferredValue(q);

  async function loadOrdersList() {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_no, status, document_type, invoice_no, invoice_date, credit_note_no, credit_note_date, gross_total, customer_id, created_at, due_date, payment_status, paid_at, dunning_level, dunning_last_at, dunning_note, document_archived, document_archived_at, customers:customers ( id, company_name )"
      )
      .or("invoice_no.not.is.null,credit_note_no.not.is.null")
      .order("created_at", { ascending: false });
    if (error) throw error;
    setRows(data || []);
  }

  function clearMessages() {
    setErr("");
    setInfo("");
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      clearMessages();
      try {
        await loadOrdersList();
        setPaymentsLoading(true);
        const { data: payRows } = await supabase
          .from("payments")
          .select("id, order_id, amount, currency, method, paid_at, orders:orders ( invoice_no, order_no )")
          .order("paid_at", { ascending: false })
          .limit(20);
        setPayments(payRows || []);
        setPaymentsLoading(false);
        const { data: tplRows } = await supabase
          .from("dunning_templates")
          .select("id, level, title, body")
          .order("level", { ascending: true });
        setTemplates(tplRows || []);
        const { data: companyRows } = await supabase
          .from("company_profile")
          .select("id, legal_name, city")
          .limit(1);
        setCompanyProfile(companyRows?.[0] || null);
      } catch (e) {
        setErr(prettySupabaseError(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("documentsFilter");
    if (!raw) return;
    try {
      const { q: dq } = JSON.parse(raw);
      if (dq) setQ(String(dq));
    } catch {
      // ignore
    }
    localStorage.removeItem("documentsFilter");
  }, []);

  const indexedRows = useMemo(() => {
    return rows.map((r) => {
      const docNo = r.document_type === "credit_note" ? r.credit_note_no : r.invoice_no;
      const customer = r.customers?.company_name || "";
      const docDateRaw = r.document_type === "credit_note" ? r.credit_note_date : r.invoice_date;
      return {
        ...r,
        __docNo: docNo,
        __customerName: customer,
        __docDateRaw: docDateRaw,
        __docDateObj: docDateRaw ? new Date(docDateRaw) : null,
        __searchHay: `${docNo || ""} ${r.order_no || ""} ${customer}`.toLowerCase(),
      };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const s = deferredQ.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    return indexedRows.filter((r) => {
      const matchesText = !s || r.__searchHay.includes(s);
      const matchesType = typeFilter === "all" || r.document_type === typeFilter;
      const matchesStatus = statusFilter === "all" || r.payment_status === statusFilter;
      const matchesArchive =
        archiveFilter === "all" ||
        (archiveFilter === "archived" ? r.document_archived : !r.document_archived);
      const matchesFrom = !from || (r.__docDateObj && r.__docDateObj >= from);
      const matchesTo = !to || (r.__docDateObj && r.__docDateObj <= to);
      return matchesText && matchesType && matchesStatus && matchesArchive && matchesFrom && matchesTo;
    });
  }, [indexedRows, deferredQ, typeFilter, statusFilter, archiveFilter, fromDate, toDate]);

  const opRows = useMemo(() => {
    return indexedRows.filter(
      (r) =>
        r.document_type !== "credit_note" &&
        !r.document_archived &&
        (r.payment_status === "open" || r.payment_status === "partial" || r.payment_status === "overdue")
    );
  }, [indexedRows]);

  const overdueRows = useMemo(
    () => opRows.filter((r) => r.payment_status === "overdue"),
    [opRows]
  );

  const opTotals = useMemo(() => {
    const open = opRows.filter((r) => r.payment_status === "open").reduce((sum, r) => sum + Number(r.gross_total || 0), 0);
    const overdue = opRows.filter((r) => r.payment_status === "overdue").reduce((sum, r) => sum + Number(r.gross_total || 0), 0);
    const partial = opRows.filter((r) => r.payment_status === "partial").reduce((sum, r) => sum + Number(r.gross_total || 0), 0);
    return { open, overdue, partial, total: open + overdue + partial };
  }, [opRows]);

  const openOrder = useCallback((orderId, action, docType) => {
    if (!orderId) return;
    if (action) {
      localStorage.setItem(
        "deepLink",
        JSON.stringify({
          module: "orders",
          id: orderId,
          action,
          docType,
        })
      );
    }
    window.dispatchEvent(
      new CustomEvent("app:navigate", {
        detail: { module: "orders", id: orderId },
      })
    );
  }, []);

  function handleExport() {
    downloadCsv(`belege_${new Date().toISOString().slice(0, 10)}.csv`, filtered);
  }

  async function exportInvoices() {
    clearMessages();
    const { data, error } = await supabase.from("invoice_export_view").select("*");
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    const rowsExport = (data || []).map((r) => ({
      doc_no: r.invoice_no,
      doc_date: r.invoice_date,
      due_date: r.due_date,
      payment_status: r.payment_status,
      customer_name: r.customer_name,
      net_total: r.net_total,
      vat_total: r.vat_total,
      gross_total: r.gross_total,
      currency: r.currency,
    }));
    downloadCsv(`rechnungen_${new Date().toISOString().slice(0, 10)}.csv`, rowsExport);
  }

  async function exportCreditNotes() {
    clearMessages();
    const { data, error } = await supabase.from("credit_note_export_view").select("*");
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    const rowsExport = (data || []).map((r) => ({
      doc_no: r.credit_note_no,
      doc_date: r.credit_note_date,
      customer_name: r.customer_name,
      net_total: r.net_total,
      vat_total: r.vat_total,
      gross_total: r.gross_total,
      currency: r.currency,
    }));
    downloadCsv(`gutschriften_${new Date().toISOString().slice(0, 10)}.csv`, rowsExport);
  }

  function exportOpenItems() {
    const rowsExport = opRows.map((r) => ({
      doc_no: r.invoice_no,
      doc_date: r.invoice_date,
      due_date: r.due_date,
      payment_status: r.payment_status,
      customer_name: r.customers?.company_name || "",
      gross_total: r.gross_total,
      currency: r.currency || "CHF",
    }));
    downloadCsv(`offene_posten_${new Date().toISOString().slice(0, 10)}.csv`, rowsExport);
  }

  async function exportPayments() {
    clearMessages();
    const { data, error } = await supabase.from("payment_export_view").select("*");
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    const rowsExport = (data || []).map((r) => ({
      invoice_no: r.invoice_no,
      order_no: r.order_no,
      amount: r.amount,
      currency: r.currency,
      method: r.method,
      paid_at: r.paid_at,
      customer_name: r.customer_name,
    }));
    downloadCsv(`zahlungen_${new Date().toISOString().slice(0, 10)}.csv`, rowsExport);
  }

  async function bumpDunning(orderId, currentLevel) {
    if (!orderId) return;
    const { error } = await supabase.rpc("bump_dunning_level", {
      p_order_id: orderId,
      p_note: null,
      p_max_level: 3,
    });
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    await loadOrdersList();
    setInfo(`Mahnstufe für Beleg aktualisiert (neu: ${Math.min(Number(currentLevel || 0) + 1, 3)}).`);
  }

  async function saveDunningNote(orderId) {
    if (!orderId) return;
    setSavingNoteId(orderId);
    const note = (noteDraftById[orderId] || "").trim();
    const { error } = await supabase
      .from("orders")
      .update({ dunning_note: note })
      .eq("id", orderId);
    setSavingNoteId(null);
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === orderId ? { ...r, dunning_note: note } : r)));
    setInfo("Mahnnotiz gespeichert.");
  }

  async function toggleArchive(orderId, nextArchived) {
    if (!orderId) return;
    const { error } = await supabase
      .from("orders")
      .update({
        document_archived: nextArchived,
        document_archived_at: nextArchived ? new Date().toISOString() : null,
      })
      .eq("id", orderId);
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    await supabase.rpc("log_audit_event", {
      p_action: nextArchived ? "document.archived" : "document.unarchived",
      p_entity: "orders",
      p_entity_id: orderId,
      p_data: { archived: nextArchived },
    });
    setRows((prev) =>
      prev.map((r) =>
        r.id === orderId
          ? {
              ...r,
              document_archived: nextArchived,
              document_archived_at: nextArchived ? new Date().toISOString() : null,
            }
          : r
      )
    );
    setInfo(nextArchived ? "Beleg archiviert." : "Beleg reaktiviert.");
  }

  async function markPaid(orderId, grossTotal) {
    if (!orderId) return;
    const amountRaw = prompt("Betrag (CHF):", String(Number(grossTotal || 0).toFixed(2)));
    if (amountRaw === null) return;
    const amount = Number(amountRaw.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr("Betrag muss > 0 sein.");
      return;
    }
    const method = prompt("Zahlungsart (z.B. Überweisung, Karte, Bar):", "Überweisung");
    const { error } = await supabase.rpc("apply_payment", {
      p_order_id: orderId,
      p_amount: amount,
      p_method: method ? method.trim() : null,
      p_paid_at: new Date().toISOString(),
      p_note: null,
    });
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    // refresh orders + payments
    await loadOrdersList();
    const { data: payRows } = await supabase
      .from("payments")
      .select("id, order_id, amount, currency, method, paid_at, orders:orders ( invoice_no, order_no )")
      .order("paid_at", { ascending: false })
      .limit(20);
    setPayments(payRows || []);
    setInfo("Zahlung verbucht.");
  }

  async function toggleHistory(orderId) {
    if (!orderId) return;
    if (historyOpenId === orderId) {
      setHistoryOpenId(null);
      setHistoryRows([]);
      return;
    }
    setHistoryOpenId(orderId);
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("document_history_view")
      .select("order_id, event_at, event_type, detail")
      .eq("order_id", orderId)
      .order("event_at", { ascending: false });
    setHistoryLoading(false);
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    setHistoryRows(data || []);
  }

  function togglePreview(orderId) {
    setPreviewOpenId((prev) => (prev === orderId ? null : orderId));
  }

  async function getHtml2Pdf() {
    if (typeof window !== "undefined" && window.html2pdf) return window.html2pdf;
    const mod = await import("html2pdf.js");
    return mod.default || mod;
  }

  function getPdfStyleText() {
    return `
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font-family: "Helvetica Neue", Arial, sans-serif; }
      .print-page { width: 210mm; padding: 14mm 16mm; background: #ffffff; color: #0f172a; line-height: 1.45; }
      .print-title { font-size: 22px; font-weight: 700; }
      .print-muted { color: #475569; }
      .print-card { border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff; padding: 12px; }
      .print-section-title { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #475569; }
      .print-row { display: flex; justify-content: space-between; font-size: 12px; }
      .print-body { white-space: pre-wrap; font-size: 12px; }
    `;
  }

  async function handleDunningPdf(orderId) {
    const doc = rows.find((r) => r.id === orderId);
    if (!doc) return;
    setPdfBusyId(orderId);
    setPdfOrderId(orderId);
    await new Promise((r) => setTimeout(r, 100));
    const element = printRef.current;
    if (!element) {
      setPdfBusyId(null);
      setPdfOrderId(null);
      return;
    }
    const base = doc.invoice_no || doc.order_no || "mahnung";
    const safeName = String(base).replace(/[^\w-]+/g, "_");
    try {
      const html2pdf = await getHtml2Pdf();
      await html2pdf()
        .set({
          margin: 0,
          filename: `${safeName}_mahnung.pdf`,
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            windowWidth: 820,
            onclone: (docClone) => {
              docClone.querySelectorAll("style,link[rel='stylesheet']").forEach((n) => n.remove());
              const style = docClone.createElement("style");
              style.textContent = getPdfStyleText();
              docClone.head.appendChild(style);
            },
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save();
      await supabase.from("document_files").insert({
        order_id: orderId,
        file_type: "dunning_pdf",
        file_name: `${safeName}_mahnung.pdf`,
        file_url: `local://${safeName}_mahnung.pdf`,
        note: "Mahnbrief PDF (lokal gespeichert)",
      });
      setInfo("Mahnbrief-PDF erstellt.");
    } finally {
      setPdfBusyId(null);
      setPdfOrderId(null);
    }
  }

  async function markOverdue() {
    clearMessages();
    setOverdueBusy(true);
    const { data, error } = await supabase.rpc("mark_overdue_invoices");
    setOverdueBusy(false);
    if (error) {
      setErr(prettySupabaseError(error));
      return;
    }
    // reload list after batch update
    try {
      await loadOrdersList();
      if (typeof data === "number") {
        setInfo(`${data} Belege als überfällig markiert.`);
      }
    } catch (e) {
      setErr(prettySupabaseError(e));
    }
  }

  const pdfDoc = useMemo(() => {
    if (!pdfOrderId) return null;
    return rows.find((r) => r.id === pdfOrderId) || null;
  }, [rows, pdfOrderId]);

  const pdfTemplate = useMemo(() => {
    if (!pdfDoc) return null;
    return templates.find((t) => t.level === Number(pdfDoc.dunning_level || 1)) || templates[0] || null;
  }, [templates, pdfDoc]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Belege</h1>
          <p className="text-sm text-slate-500">Rechnungen und Gutschriften im Überblick.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={markOverdue}
            disabled={overdueBusy}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            title="Offene Belege mit Fälligkeitsdatum prüfen"
          >
            {overdueBusy ? "Prüfe…" : "Überfällige prüfen"}
          </button>
          <button
            onClick={async () => {
              clearMessages();
              setAutoDunningBusy(true);
              const { data, error } = await supabase.rpc("run_dunning_batch", { p_max_level: 3 });
              setAutoDunningBusy(false);
              if (error) {
                setErr(prettySupabaseError(error));
                return;
              }
              try {
                await loadOrdersList();
                if (typeof data === "number") {
                  setInfo(`${data} Belege automatisch gemahnt.`);
                }
              } catch (e) {
                setErr(prettySupabaseError(e));
              }
            }}
            disabled={autoDunningBusy || overdueRows.length === 0}
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100"
            title="Mahnstufe für überfällige Belege automatisch erhöhen"
          >
            {autoDunningBusy ? "Mahne…" : `Auto‑Mahnen (${overdueRows.length})`}
          </button>
          <button
            onClick={handleExport}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            CSV exportieren
          </button>
          <button
            onClick={exportInvoices}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Rechnungen CSV
          </button>
          <button
            onClick={exportCreditNotes}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Gutschriften CSV
          </button>
          <button
            onClick={async () => {
              clearMessages();
              const { data, error } = await supabase.from("trustee_export_view").select("*");
              if (error) {
                setErr(prettySupabaseError(error));
                return;
              }
              const rowsExport = (data || []).map((r) => ({
                record_type: r.record_type,
                invoice_no: r.invoice_no,
                order_no: r.order_no,
                customer_name: r.customer_name,
                amount: r.amount,
                currency: r.currency,
                event_date: r.event_date,
                due_date: r.due_date,
                payment_status: r.payment_status,
                method: r.method,
              }));
              downloadCsv(`treuhand_export_${new Date().toISOString().slice(0, 10)}.csv`, rowsExport);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Treuhänder CSV
          </button>
          <button
            onClick={async () => {
              clearMessages();
              const { data, error } = await supabase.from("dunning_log_export_view").select("*");
              if (error) {
                setErr(prettySupabaseError(error));
                return;
              }
              const rowsExport = (data || []).map((r) => ({
                created_at: r.created_at,
                invoice_no: r.invoice_no,
                order_no: r.order_no,
                customer_name: r.customer_name,
                level: r.level,
                note: r.note,
              }));
              downloadCsv(`mahnlog_${new Date().toISOString().slice(0, 10)}.csv`, rowsExport);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Mahnlog CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche nach Belegnr., Auftrag oder Kunde…"
          className="w-full md:w-[420px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Alle</option>
          <option value="invoice">Rechnung</option>
          <option value="credit_note">Gutschrift</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Alle Status</option>
          <option value="open">Offen</option>
          <option value="overdue">Überfällig</option>
          <option value="partial">Teilbezahlt</option>
          <option value="paid">Bezahlt</option>
        </select>
        <select
          value={archiveFilter}
          onChange={(e) => setArchiveFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="active">Aktive</option>
          <option value="archived">Archiv</option>
          <option value="all">Alle</option>
        </select>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}
      {!err && info ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">{info}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold">Offene Posten (OP)</div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">Offen</div>
              <div className="text-base font-semibold">{formatCHF(opTotals.open)}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs text-rose-600">Überfällig</div>
              <div className="text-base font-semibold text-rose-700">{formatCHF(opTotals.overdue)}</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs text-amber-700">Teilbezahlt</div>
              <div className="text-base font-semibold text-amber-700">{formatCHF(opTotals.partial)}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="text-xs text-slate-500">Total OP</div>
              <div className="text-base font-semibold">{formatCHF(opTotals.total)}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <div>{opRows.length} offene Belege</div>
            <button
              onClick={exportOpenItems}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
            >
              OP CSV export
            </button>
          </div>

          {opRows.length > 0 && (
            <>
            <div className="mt-4 space-y-2 md:hidden">
              {opRows.map((r) => (
                <div key={`${r.id}-op-mobile`} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{r.invoice_no || "—"}</div>
                    <div className="font-medium tabular-nums">{formatCHF(r.gross_total)}</div>
                  </div>
                  <div className="mt-1 text-slate-500">{r.customers?.company_name || "—"}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                        r.payment_status === "overdue"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : r.payment_status === "partial"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.payment_status === "overdue"
                        ? "überfällig"
                        : r.payment_status === "partial"
                        ? "teilbezahlt"
                        : "offen"}
                    </span>
                    <button
                      onClick={() => bumpDunning(r.id, r.dunning_level)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                      title="Mahnstufe erhöhen"
                    >
                      Mahnstufe {Number(r.dunning_level || 0)} →
                    </button>
                    <button
                      onClick={() => openOrder(r.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Auftrag öffnen
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
              <div className="min-w-[1200px]">
              <div className="grid grid-cols-[180px_minmax(280px,1fr)_160px_130px_180px_160px] gap-x-3 bg-slate-100 px-3 py-2 text-xs text-slate-700">
                <div>Beleg</div>
                <div>Kunde</div>
                <div className="text-right">Betrag</div>
                <div>Status</div>
                <div>Mahnstufe</div>
                <div className="text-right">Aktion</div>
              </div>
              <div className="divide-y divide-slate-200">
                {opRows.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[180px_minmax(280px,1fr)_160px_130px_180px_160px] gap-x-3 px-3 py-2 text-xs"
                  >
                    <div className="font-medium whitespace-nowrap min-w-0 truncate">{r.invoice_no || "—"}</div>
                    <div className="truncate min-w-0">{r.customers?.company_name || "—"}</div>
                    <div className="text-right font-medium tabular-nums whitespace-nowrap">{formatCHF(r.gross_total)}</div>
                    <div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                          r.payment_status === "overdue"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : r.payment_status === "partial"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.payment_status === "overdue"
                          ? "überfällig"
                          : r.payment_status === "partial"
                          ? "teilbezahlt"
                          : "offen"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <button
                        onClick={() => bumpDunning(r.id, r.dunning_level)}
                        className="w-full max-w-[170px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-xs hover:bg-slate-50"
                        title="Mahnstufe erhöhen"
                      >
                        Mahnstufe {Number(r.dunning_level || 0)} →
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => openOrder(r.id)}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                      >
                        Auftrag öffnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            </div>
            </>
          )}
        </div>
        <div className="space-y-2 md:hidden">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">Lade…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">Keine Belege.</div>
          ) : (
            filtered.map((r) => {
              const isCredit = r.document_type === "credit_note";
              const docNo = isCredit ? r.credit_note_no : r.invoice_no;
              const docDate = isCredit ? r.credit_note_date : r.invoice_date;
              return (
                <div key={`${r.id}-mobile`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{docNo || "—"}</div>
                    <div className="text-xs text-slate-500">
                      {docDate ? new Date(docDate).toLocaleDateString("de-CH") : "—"}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{isCredit ? "Gutschrift" : "Rechnung"} · {r.customers?.company_name || "—"}</div>
                  <div className="mt-2 text-sm font-medium tabular-nums">{formatCHF(r.gross_total)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                        r.payment_status === "paid"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : r.payment_status === "overdue"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.payment_status === "paid"
                        ? "bezahlt"
                        : r.payment_status === "overdue"
                        ? "überfällig"
                        : r.payment_status === "partial"
                        ? "teilbezahlt"
                        : "offen"}
                    </span>
                    <span className="text-xs text-slate-500">L{Number(r.dunning_level || 0)}</span>
                    <span className="text-xs text-slate-500">{r.document_archived ? "archiviert" : "aktiv"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => openOrder(r.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Auftrag öffnen
                    </button>
                    <button
                      onClick={() => toggleHistory(r.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Historie
                    </button>
                    <button
                      onClick={() => openOrder(r.id, "pdf", r.document_type || "invoice")}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      PDF
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
          <div className="min-w-[1780px]">
            <div className="grid grid-cols-[180px_120px_minmax(340px,1fr)_180px_140px_140px_140px_140px_100px] gap-x-3 bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <div>Beleg</div>
              <div>Typ</div>
              <div>Kunde</div>
              <div className="text-right">Betrag</div>
              <div>Datum</div>
              <div>Status</div>
              <div>Bezahlt am</div>
              <div>Mahnung</div>
              <div>Archiv</div>
            </div>
            <div className="divide-y divide-slate-200">
            {loading ? (
              <div className="px-3 py-3 text-sm text-slate-500">Lade…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">Keine Belege.</div>
            ) : (
              filtered.map((r) => {
                const isCredit = r.document_type === "credit_note";
                const docNo = isCredit ? r.credit_note_no : r.invoice_no;
                const docDate = isCredit ? r.credit_note_date : r.invoice_date;
                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-[180px_120px_minmax(340px,1fr)_180px_140px_140px_140px_140px_100px] gap-x-3 px-3 py-2 text-sm"
                  >
                    <div className="font-medium whitespace-nowrap min-w-0 truncate">{docNo || "—"}</div>
                    <div className="whitespace-nowrap">{isCredit ? "Gutschrift" : "Rechnung"}</div>
                    <div className="truncate min-w-0">{r.customers?.company_name || "—"}</div>
                    <div className="text-right whitespace-nowrap font-medium tabular-nums">{formatCHF(r.gross_total)}</div>
                    <div className="text-xs text-slate-500 whitespace-nowrap min-w-0 truncate">
                      {docDate ? new Date(docDate).toLocaleDateString("de-CH") : "—"}
                    </div>
                    <div className="text-xs whitespace-nowrap min-w-0">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                          r.payment_status === "paid"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : r.payment_status === "overdue"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.payment_status === "paid"
                          ? "bezahlt"
                          : r.payment_status === "overdue"
                          ? "überfällig"
                          : r.payment_status === "partial"
                          ? "teilbezahlt"
                          : "offen"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap min-w-0 truncate">
                      {r.paid_at ? new Date(r.paid_at).toLocaleDateString("de-CH") : "—"}
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap min-w-0 truncate">
                      L{Number(r.dunning_level || 0)}
                      {r.dunning_last_at
                        ? ` · ${new Date(r.dunning_last_at).toLocaleDateString("de-CH")}`
                        : ""}
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap">
                      {r.document_archived ? "archiviert" : "aktiv"}
                    </div>
                    <div className="col-span-full mt-2 border-t border-slate-200 pt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => openOrder(r.id)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Auftrag öffnen
                        </button>
                        <button
                          onClick={() => toggleHistory(r.id)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Historie
                        </button>
                        <button
                          onClick={() => openOrder(r.id, "pdf", r.document_type || "invoice")}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          title="PDF direkt herunterladen"
                        >
                          PDF
                        </button>
                        {r.document_type !== "credit_note" ? (
                          <button
                            onClick={() => togglePreview(r.id)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            Mahnbrief Vorschau
                          </button>
                        ) : null}
                        {r.document_type !== "credit_note" ? (
                          <button
                            onClick={() => handleDunningPdf(r.id)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                            disabled={pdfBusyId === r.id}
                          >
                            {pdfBusyId === r.id ? "Mahnbrief PDF…" : "Mahnbrief PDF"}
                          </button>
                        ) : null}
                        {r.payment_status !== "paid" && r.document_type !== "credit_note" ? (
                          <button
                            onClick={() => markPaid(r.id, r.gross_total)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                            title="Als bezahlt markieren"
                          >
                            Bezahlt markieren
                          </button>
                        ) : null}
                        {r.document_type !== "credit_note" ? (
                          <>
                            <button
                              onClick={() => saveDunningNote(r.id)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                              disabled={savingNoteId === r.id}
                            >
                              {savingNoteId === r.id ? "Notiz speichert…" : "Mahnnotiz speichern"}
                            </button>
                            <button
                              onClick={() => bumpDunning(r.id, r.dunning_level)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                              title="Mahnstufe erhöhen"
                            >
                              Mahnstufe erhöhen
                            </button>
                          </>
                        ) : null}
                        <button
                          onClick={() => toggleArchive(r.id, !r.document_archived)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          {r.document_archived ? "Reaktivieren" : "Archivieren"}
                        </button>
                      </div>
                      {r.document_type !== "credit_note" ? (
                        <div className="mt-2">
                          <input
                            value={noteDraftById[r.id] ?? r.dunning_note ?? ""}
                            onChange={(e) =>
                              setNoteDraftById((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                            placeholder="Mahnnotiz"
                          />
                        </div>
                      ) : null}
                    </div>
                    {historyOpenId === r.id ? (
                      <div className="col-span-full mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                        {historyLoading ? (
                          <div className="text-slate-500">Historie lädt…</div>
                        ) : historyRows.length === 0 ? (
                          <div className="text-slate-500">Keine Historie vorhanden.</div>
                        ) : (
                          <div className="space-y-2">
                            {historyRows.map((h, idx) => (
                              <div key={`${h.event_at}-${h.event_type}-${idx}`} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px]">
                                    {historyEventLabel(h.event_type)}
                                  </span>
                                  <span>{historyEventText(h)}</span>
                                </div>
                                <div className="text-slate-500">
                                  {h.event_at ? new Date(h.event_at).toLocaleString("de-CH") : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {previewOpenId === r.id ? (
                      <div className="col-span-full mt-2">
                        <DunningLetterPreview
                          template={templates.find((t) => t.level === Number(r.dunning_level || 1)) || templates[0]}
                          doc={r}
                          company={companyProfile}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold">Zahlungsjournal (letzte 20)</div>
          {paymentsLoading ? (
            <div className="text-xs text-slate-500 mt-2">Lade…</div>
          ) : payments.length === 0 ? (
            <div className="text-xs text-slate-500 mt-2">Keine Zahlungen.</div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[140px_1fr_120px_140px] bg-slate-100 px-3 py-2 text-xs text-slate-700">
                <div>Beleg</div>
                <div>Methode</div>
                <div className="text-right">Betrag</div>
                <div>Datum</div>
              </div>
              <div className="divide-y divide-slate-200">
                {payments.map((p) => (
                  <div key={p.id} className="grid grid-cols-[140px_1fr_120px_140px] px-3 py-2 text-xs">
                    <div className="font-medium">{p.orders?.invoice_no || p.orders?.order_no || "—"}</div>
                    <div>{p.method || "—"}</div>
                    <div className="text-right">
                      {formatCHF(p.amount)} {p.currency || "CHF"}
                    </div>
                    <div className="text-slate-500">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString("de-CH") : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button
              onClick={exportPayments}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
            >
              Zahlungsjournal CSV
            </button>
          </div>
        </div>
      </div>
      {pdfOrderId ? (
        <div
          ref={printRef}
          style={{ position: "absolute", left: "-9999px", top: 0, width: "210mm" }}
          aria-hidden
        >
          <div className="print-page">
            <div className="print-title">Mahnbrief</div>
            <div className="print-muted mt-2">
              {companyProfile?.legal_name || "Firma"} · {companyProfile?.city || ""}
            </div>
            <div className="mt-4 print-card">
              <div className="print-section-title">Empfänger</div>
              <div className="mt-2 text-sm">
                {pdfDoc?.customers?.company_name || "—"}
              </div>
            </div>
            <div className="mt-4 print-card">
              <div className="print-section-title">Beleg</div>
              <div className="mt-2 space-y-1">
                <div className="print-row">
                  <span>Rechnung</span>
                  <span>{pdfDoc?.invoice_no || "—"}</span>
                </div>
                <div className="print-row">
                  <span>Fällig</span>
                  <span>
                    {pdfDoc?.due_date
                      ? new Date(pdfDoc.due_date).toLocaleDateString("de-CH")
                      : "—"}
                  </span>
                </div>
                <div className="print-row">
                  <span>Betrag</span>
                  <span>
                    {formatCHF(pdfDoc?.gross_total || 0)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 print-card print-body">
              {(() => {
                const body = pdfTemplate?.body || "";
                return body
                  .replaceAll("{{due_date}}", pdfDoc?.due_date ? new Date(pdfDoc.due_date).toLocaleDateString("de-CH") : "—")
                  .replaceAll("{{invoice_no}}", pdfDoc?.invoice_no || "—")
                  .replaceAll("{{customer_name}}", pdfDoc?.customers?.company_name || "—")
                  .replaceAll("{{amount}}", pdfDoc?.gross_total ? `CHF ${Number(pdfDoc.gross_total).toFixed(2)}` : "CHF 0.00");
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
