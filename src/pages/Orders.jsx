import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import QRCode from "qrcode";
import { buildQrBillPayload } from "../lib/qrBill";

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
      : tone === "info"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-slate-200 bg-white text-slate-800";

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
  if (s === "open") return "border-sky-200 bg-sky-50";
  if (s === "done") return "border-emerald-200 bg-emerald-50";
  if (s === "storno") return "border-red-200 bg-red-50";
  if (s === "retoure") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-white";
}

export default function Orders() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [printOrderId, setPrintOrderId] = useState(null);
  const [printDocType, setPrintDocType] = useState("invoice");
  const [printQrDataUrl, setPrintQrDataUrl] = useState("");
  const [printQrErr, setPrintQrErr] = useState("");
  const printRef = useRef(null);
  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [pdfMode, setPdfMode] = useState(false);
  const [orderMovementsByOrderId, setOrderMovementsByOrderId] = useState({});
  const [orderAuditById, setOrderAuditById] = useState({});
  const [orderReturnsByLineId, setOrderReturnsByLineId] = useState({});
  const [movementFilterByOrderId, setMovementFilterByOrderId] = useState({});
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  // Create order draft
  const [draftItemId, setDraftItemId] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftLines, setDraftLines] = useState([]);
  const [draftCustomerId, setDraftCustomerId] = useState("");

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

  const loadCustomers = useCallback(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("id, company_name, contact_name, street, zip, city, country")
      .order("company_name", { ascending: true });
    if (error) throw error;
    setCustomers(data || []);
  }, []);

  const loadOrders = useCallback(async () => {
    // Wir holen orders + lines + item name/unit/price.
    // Wichtig: order_lines.price_chf & unit existieren jetzt (SQL oben).
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id, order_no, status, total_chf, net_total, vat_total, gross_total, invoice_no, invoice_date, invoice_year, payment_terms_days, due_date, supply_date, currency, stock_applied, stock_reversed, document_type, credit_note_no, credit_note_date, payment_status, paid_at, created_at, customer_id,
        order_lines:order_lines (
          id, order_id, item_id, qty, unit, price_chf, created_at,
          item:items ( id, item_no, name, unit, current_stock )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    const orderIds = (data || []).map((o) => o.id);

    let returnByLineId = {};
    if (orderIds.length > 0) {
      const { data: returnRows, error: returnErr } = await supabase
        .from("order_line_return_status")
        .select("order_line_id, order_id, ordered_qty, returned_qty, net_qty")
        .in("order_id", orderIds);
      if (returnErr) throw returnErr;

      returnByLineId = (returnRows || []).reduce((acc, row) => {
        acc[row.order_line_id] = row;
        return acc;
      }, {});
    }

    let movementsByOrderId = {};
    if (orderIds.length > 0) {
      const { data: movements, error: movErr } = await supabase
        .from("stock_movements")
        .select(
          "id, created_at, order_id, order_line_id, reason_code, movement_type, qty, qty_change, unit, notes"
        )
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
      if (movErr) throw movErr;

      movementsByOrderId = (movements || []).reduce((acc, m) => {
        if (!acc[m.order_id]) acc[m.order_id] = [];
        acc[m.order_id].push(m);
        return acc;
      }, {});
    }

    let returnsByLineId = {};
    if (orderIds.length > 0) {
      const { data: returnRows, error: returnRowsErr } = await supabase
        .from("order_line_returns")
        .select("id, order_line_id, qty, note, created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
      if (returnRowsErr) throw returnRowsErr;

      returnsByLineId = (returnRows || []).reduce((acc, r) => {
        if (!acc[r.order_line_id]) acc[r.order_line_id] = [];
        acc[r.order_line_id].push(r);
        return acc;
      }, {});
    }

    let auditById = {};
    if (orderIds.length > 0) {
      const { data: auditRows, error: auditErr } = await supabase
        .from("order_fulfillment_audit")
        .select("order_id, ordered_qty, delivered_qty, returned_qty, net_qty, last_movement_at")
        .in("order_id", orderIds);
      if (auditErr) throw auditErr;

      auditById = (auditRows || []).reduce((acc, row) => {
        acc[row.order_id] = row;
        return acc;
      }, {});
    }

    const enriched = (data || []).map((o) => ({
      ...o,
      order_lines: (o.order_lines || []).map((l) => ({
        ...l,
        return_status: returnByLineId[l.id] || null,
      })),
    }));

    setOrders(enriched);
    setOrderMovementsByOrderId(movementsByOrderId);
    setOrderAuditById(auditById);
    setOrderReturnsByLineId(returnsByLineId);
  }, []);

  const loadCompanyProfile = useCallback(async () => {
    const { data, error } = await supabase
      .from("company_profile")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    setCompanyProfile((data || [])[0] || null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      await Promise.all([loadItems(), loadCustomers(), loadOrders(), loadCompanyProfile()]);
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setLoading(false);
    }
  }, [loadItems, loadCustomers, loadOrders, loadCompanyProfile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const draftTotals = useMemo(() => {
    const totalQty = draftLines.reduce((sum, l) => sum + Number(l.qty || 0), 0);
    const totalCHF = draftLines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.price_chf || 0), 0);
    return { totalQty, totalCHF };
  }, [draftLines]);

  const printOrder = useMemo(() => {
    return orders.find((o) => o.id === printOrderId) || null;
  }, [orders, printOrderId]);

  function handlePrint(orderId) {
    const order = orders.find((o) => o.id === orderId);
    setPrintOrderId(orderId);
    setPrintDocType(order?.document_type === "credit_note" ? "credit_note" : "invoice");
    setPrintQrErr("");
    setPrintQrDataUrl("");
    if (order && order.document_type !== "credit_note") {
      const customer = customers.find((c) => c.id === order.customer_id);
      if (!companyProfile?.iban) {
        setPrintQrErr("IBAN fehlt.");
      } else if (!customer) {
        setPrintQrErr("Kunde fehlt.");
      } else {
        const payload = buildQrBillPayload({
          iban: companyProfile.iban,
          creditorName: companyProfile.legal_name,
          creditorStreet: companyProfile.street,
          creditorStreet2: companyProfile.street2,
          creditorZip: companyProfile.zip,
          creditorCity: companyProfile.city,
          creditorCountry: companyProfile.country || "CH",
          amount: order.gross_total ?? order.total_chf ?? 0,
          currency: order.currency || "CHF",
          debtorName: customer.company_name,
          debtorStreet: customer.street,
          debtorStreet2: customer.street2,
          debtorZip: customer.zip,
          debtorCity: customer.city,
          debtorCountry: customer.country || "CH",
          reference: order.invoice_no || "",
          additionalInfo: order.order_no || "",
        });
        QRCode.toDataURL(payload, { margin: 1, width: 220 })
          .then((url) => setPrintQrDataUrl(url))
          .catch(() => setPrintQrErr("QR konnte nicht erzeugt werden."));
      }
    }
    setTimeout(() => window.print(), 50);
  }

  const getHtml2Pdf = useCallback(async () => {
    if (typeof window !== "undefined" && window.html2pdf) return window.html2pdf;
    const mod = await import("html2pdf.js");
    return mod.default || mod;
  }, []);

  const getPdfStyleText = useCallback(() => `
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font-family: "Helvetica Neue", Arial, sans-serif; }
      .print-page { width: 210mm; padding: 12mm 14mm; background: #ffffff; color: #0f172a; line-height: 1.45; }
      .print-title { font-size: 24px; font-weight: 700; letter-spacing: 0.2px; }
      .print-meta { font-size: 12px; }
      .print-muted { color: #475569; }
      .print-card { border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff; }
      .print-card.p-4 { padding: 14px; }
      .print-card.p-3 { padding: 12px; }
      .print-table-head { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #cbd5e1; background: #f1f5f9; padding-top: 6px; padding-bottom: 6px; }
      .print-table-row { font-size: 12px; padding-top: 6px; padding-bottom: 6px; }
      .print-footer { font-size: 10px; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 16px; }
      .print-meta + .print-meta { margin-top: 4px; }
      .print-page .text-right { text-align: right; }
      .print-page .text-sm { font-size: 12px; }
      .print-page .text-xs { font-size: 11px; }
      .print-page .font-semibold { font-weight: 600; }
      .print-page .font-medium { font-weight: 600; }
      .print-page .grid { display: grid; gap: 8px; }
      .print-page .flex { display: flex; gap: 10px; }
      .print-page .items-start { align-items: flex-start; }
      .print-page .items-center { align-items: center; }
      .print-page .justify-between { justify-content: space-between; }
      .print-page .justify-end { justify-content: flex-end; }
      .print-page .gap-6 { gap: 18px; }
      .print-page .mt-8 { margin-top: 22px; }
      .print-page .mt-6 { margin-top: 18px; }
      .print-page .mt-4 { margin-top: 14px; }
      .print-page .mt-3 { margin-top: 10px; }
      .print-page .mt-2 { margin-top: 8px; }
      .print-page .pb-2 { padding-bottom: 6px; }
      .print-page .border-b { border-bottom: 1px solid #cbd5e1; }
      .print-page .divide-y > * + * { border-top: 1px solid #e2e8f0; }
      .print-page img { max-width: 100%; }
      .print-page .print-table-row div { align-self: center; }
    `,
  []);

  const waitForPrintElement = useCallback(async () => {
    const maxTries = 20;
    for (let i = 0; i < maxTries; i += 1) {
      if (printRef.current) return printRef.current;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }, []);

  const handlePdfDownload = useCallback(async (orderId, docType = "invoice") => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    setPdfBusyId(orderId);
    setPdfMode(true);
    setPrintOrderId(orderId);
    setPrintDocType(docType);
    setPrintQrErr("");
    setPrintQrDataUrl("");

    if (docType === "invoice") {
      const customer = customers.find((c) => c.id === order.customer_id);
      if (!companyProfile?.iban) {
        setPrintQrErr("IBAN fehlt.");
      } else if (!customer) {
        setPrintQrErr("Kunde fehlt.");
      } else {
        try {
          const payload = buildQrBillPayload({
            iban: companyProfile.iban,
            creditorName: companyProfile.legal_name,
            creditorStreet: companyProfile.street,
            creditorStreet2: companyProfile.street2,
            creditorZip: companyProfile.zip,
            creditorCity: companyProfile.city,
            creditorCountry: companyProfile.country || "CH",
            amount: order.gross_total ?? order.total_chf ?? 0,
            currency: order.currency || "CHF",
            debtorName: customer.company_name,
            debtorStreet: customer.street,
            debtorStreet2: customer.street2,
            debtorZip: customer.zip,
            debtorCity: customer.city,
            debtorCountry: customer.country || "CH",
            reference: order.invoice_no || "",
            additionalInfo: order.order_no || "",
          });
          const url = await QRCode.toDataURL(payload, { margin: 1, width: 220 });
          setPrintQrDataUrl(url);
        } catch {
          setPrintQrErr("QR konnte nicht erzeugt werden.");
        }
      }
    }

    await new Promise((r) => setTimeout(r, 100));
    const element = await waitForPrintElement();
    if (!element) {
      setPdfMode(false);
      setPdfBusyId(null);
      return;
    }

    const isCredit = docType === "credit_note";
    const docNo = isCredit ? order.credit_note_no : order.invoice_no;
    const base = docNo || order.order_no || "beleg";
    const safeName = String(base).replace(/[^\w-]+/g, "_");

    try {
      const html2pdf = await getHtml2Pdf();
      await html2pdf()
        .set({
          margin: 0,
          filename: `${safeName}.pdf`,
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            windowWidth: 820,
            onclone: (doc) => {
              doc.querySelectorAll("style,link[rel='stylesheet']").forEach((n) => n.remove());
              const style = doc.createElement("style");
              style.textContent = getPdfStyleText();
              doc.head.appendChild(style);
              const root = doc.querySelector(".print-root");
              if (root) {
                root.classList.add("pdf-visible");
                root.style.display = "block";
                root.style.position = "static";
                root.style.left = "0";
                root.style.top = "0";
                root.style.width = "210mm";
                root.style.background = "#ffffff";
              }
            },
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save();
    } finally {
      setPdfMode(false);
      setPdfBusyId(null);
    }
  }, [orders, customers, companyProfile, getHtml2Pdf, getPdfStyleText, waitForPrintElement]);

  useEffect(() => {
    if (deepLinkHandled || orders.length === 0) return;
    const raw = localStorage.getItem("deepLink");
    if (!raw) return;
    try {
      const dl = JSON.parse(raw);
      if (dl.module === "orders" && dl.id) {
        setExpanded((prev) => ({ ...prev, [dl.id]: true }));
        if (dl.action === "pdf") {
          handlePdfDownload(dl.id, dl.docType || "invoice");
        }
        localStorage.removeItem("deepLink");
        setDeepLinkHandled(true);
      }
    } catch {
      localStorage.removeItem("deepLink");
    }
  }, [orders, deepLinkHandled, handlePdfDownload]);

  function handleDeliveryPrint(orderId) {
    setPrintOrderId(orderId);
    setPrintDocType("delivery");
    setTimeout(() => window.print(), 50);
  }

  function handleCreditNotePrint(orderId) {
    setPrintOrderId(orderId);
    setPrintDocType("credit_note");
    setTimeout(() => window.print(), 50);
  }


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
          customer_id: draftCustomerId || null,
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
      setDraftCustomerId("");
      setRetQty("1");
      setRetNote("");

      await loadOrders();
    } catch (e) {
      setErr(prettySupabaseError(e));
    } finally {
      setPosting(false);
    }
  }

  async function setStatus(order, status) {
    if (statusPostingRef.current) return;
    setErr("");
    setSuccessMsg("");
    statusPostingRef.current = true;
    setPosting(true);
    try {
      if (status === "done") {
        const { error } = await supabase.rpc("finalize_order", { p_order_id: order.id });
        if (error) throw error;
      } else if (status === "storno") {
        const st = String(order.status || "open").toLowerCase();
        if (st === "done" || st === "retoure") {
          const ok = confirm("Auftrag ist DONE/RETOURE. Wirklich stornieren und Bestand rückbuchen?");
          if (!ok) return;
          const { error } = await supabase.rpc("cancel_order_after_done", { p_order_id: order.id });
          if (error) throw error;
        } else {
          const { error } = await supabase.rpc("cancel_order", { p_order_id: order.id });
          if (error) throw error;
        }
      } else {
        throw new Error(`Unbekannter Status: ${status}`);
      }
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

  function setMovementFilter(orderId, value) {
    setMovementFilterByOrderId((prev) => ({ ...prev, [orderId]: value }));
  }

  function copyMovementsCsv(orderId) {
    const rows = orderMovementsByOrderId[orderId] || [];
    if (rows.length === 0) return;

    const header = ["created_at", "reason_code", "movement_type", "qty", "unit", "qty_change", "order_line_id"];
    const lines = rows.map((m) =>
      [
        m.created_at || "",
        m.reason_code || "",
        m.movement_type || "",
        String(m.qty ?? ""),
        m.unit || "",
        String(m.qty_change ?? ""),
        m.order_line_id || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    navigator.clipboard.writeText(csv).catch(() => {});
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

      const { error: rpcErr } = await supabase.rpc("book_return", {
        p_order_line_id: line.id,
        p_qty: qty,
        p_note: notesPayload,
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
    <div className="erp-page">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="erp-page-title">Aufträge</h1>
          <p className="erp-page-subtitle">Auftrag erstellen, erledigen, stornieren, Retoure buchen.</p>
        </div>

        <button
          onClick={refresh}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* Create order */}
      <div className="erp-card">
        <div className="font-semibold">Neuen Auftrag erstellen</div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_120px_auto_auto] md:items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Kunde wählen…</label>
            <select
              value={draftCustomerId}
              onChange={(e) => setDraftCustomerId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-slate-300"
            >
              <option value="">— kein Kunde —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Artikel wählen…</label>
            <select
              value={draftItemId}
              onChange={(e) => setDraftItemId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-slate-300"
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
            <label className="block text-xs text-slate-500 mb-1">Menge</label>
            <input
              value={draftQty}
              onChange={(e) => setDraftQty(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-slate-300"
              inputMode="numeric"
            />
          </div>

          <button
            disabled={posting}
            onClick={addDraftLine}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
          >
            Position hinzufügen
          </button>

          <button
            disabled={posting || draftLines.length === 0}
            onClick={createOrder}
            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-60"
          >
            Auftrag speichern
          </button>
        </div>

        {draftLines.length === 0 ? (
          <div className="mt-2 text-sm text-slate-500">Noch keine Positionen.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {draftLines.map((l) => (
              <div
                key={l.tmp_id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-100 px-3 py-2"
              >
                <div className="text-sm text-slate-800">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-slate-500">
                    qty: {l.qty} {l.unit} • Preis: {formatCHF(l.price_chf)} • Position:{" "}
                    {formatCHF(Number(l.qty) * Number(l.price_chf))}
                  </div>
                </div>

                <button
                  onClick={() => removeDraftLine(l.tmp_id)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                >
                  Entfernen
                </button>
              </div>
            ))}

            <div className="mt-2 text-xs text-slate-500">
              Summe: <span className="text-slate-800">{draftTotals.totalQty}</span> pcs • Warenwert:{" "}
              <span className="text-slate-800">{formatCHF(draftTotals.totalCHF)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-slate-500">Lade…</div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Aufträge.</div>
        ) : (
          orders.map((o) => {
            const st = statusLabel(o.status);
            const { totalQty, totalCHF } = computeOrderTotals(o);
            const customer = customers.find((c) => c.id === o.customer_id);
            const netTotal = o.net_total ?? totalCHF;
            const vatTotal = o.vat_total ?? 0;
            const grossTotal = o.gross_total ?? totalCHF;
            const isOpen = String(o.status || "open").toLowerCase() === "open";
            const isDone = String(o.status || "").toLowerCase() === "done";
            const isStorno = String(o.status || "").toLowerCase() === "storno";
            const isRetour = String(o.status || "").toLowerCase() === "retoure";
            const derivedPaymentStatus =
              o.payment_status === "paid"
                ? "paid"
                : o.payment_status === "overdue"
                ? "overdue"
                : o.due_date && new Date(o.due_date) < new Date()
                ? "overdue"
                : "open";
            const docNo = o.document_type === "credit_note" ? o.credit_note_no : o.invoice_no;
            const audit = orderAuditById[o.id];
            const movementFilter = movementFilterByOrderId[o.id] || "all";
            const allMovements = orderMovementsByOrderId[o.id] || [];
            const filteredMovements =
              movementFilter === "all"
                ? allMovements
                : allMovements.filter((m) => (m.reason_code || m.movement_type) === movementFilter);

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

                    <div className="mt-1 text-xs text-slate-500">
                      {customer ? (
                        <>
                          Kunde: <span className="text-slate-800">{customer.company_name}</span>{" "}
                          {customer.city ? `(${customer.city})` : ""}
                          {" • "}
                        </>
                      ) : null}
                      Positionen: <span className="text-slate-800">{totalQty}</span> • Warenwert:{" "}
                      <span className="text-slate-800">{formatCHF(totalCHF)}</span>
                      {" • "}
                      netto: <span className="text-slate-800">{formatCHF(netTotal)}</span>
                      {" • "}
                      mwst: <span className="text-slate-800">{formatCHF(vatTotal)}</span>
                      {" • "}
                      brutto: <span className="text-slate-800">{formatCHF(grossTotal)}</span>
                      {audit ? (
                        <>
                          {" • "}
                          delivered: <span className="text-slate-800">{Number(audit.delivered_qty || 0)}</span>
                          {" • "}
                          returned: <span className="text-slate-800">{Number(audit.returned_qty || 0)}</span>
                          {" • "}
                          net: <span className="text-slate-800">{Number(audit.net_qty || 0)}</span>
                          {" • "}
                          last movement:{" "}
                          <span className="text-slate-800">
                            {audit.last_movement_at ? new Date(audit.last_movement_at).toLocaleString("de-CH") : "—"}
                          </span>
                        </>
                      ) : null}
                      {" • "}
                      stock_applied: {String(!!o.stock_applied)} | stock_reversed: {String(!!o.stock_reversed)}
                      {" • "}
                      {o.created_at ? new Date(o.created_at).toLocaleString("de-CH") : ""}
                      {o.document_type === "credit_note" ? (
                        <>
                          {" • "}
                          gutschrift: <span className="text-slate-800">{o.credit_note_no || "—"}</span>
                          {o.credit_note_date ? (
                            <> ({new Date(o.credit_note_date).toLocaleDateString("de-CH")})</>
                          ) : null}
                        </>
                      ) : o.invoice_no ? (
                        <>
                          {" • "}
                          invoice: <span className="text-slate-800">{o.invoice_no}</span>
                          {o.invoice_date ? (
                            <> ({new Date(o.invoice_date).toLocaleDateString("de-CH")})</>
                          ) : null}
                        </>
                      ) : null}
                      {docNo ? (
                        <>
                          {" • "}
                          <button
                            onClick={() => {
                              localStorage.setItem("documentsFilter", JSON.stringify({ q: docNo }));
                              window.dispatchEvent(
                                new CustomEvent("app:navigate", { detail: { module: "documents" } })
                              );
                            }}
                            className="underline text-slate-700 hover:text-slate-900"
                            title="Beleg in Liste öffnen"
                          >
                            Beleg öffnen
                          </button>
                        </>
                      ) : null}
                      {o.payment_status ? (
                        <>
                          {" • "}
                          zahlung:{" "}
                          <span className="text-slate-800">
                            {derivedPaymentStatus === "paid"
                              ? "bezahlt"
                              : derivedPaymentStatus === "overdue"
                              ? "überfällig"
                              : "offen"}
                          </span>
                        </>
                      ) : null}
                      {o.due_date ? (
                        <>
                          {" • "}
                          fällig:{" "}
                          <span className="text-slate-800">
                            {new Date(o.due_date).toLocaleDateString("de-CH")}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpanded(o.id)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
                    >
                      {expanded[o.id] ? "Positionen ausblenden" : "Positionen anzeigen"}
                    </button>

                    <button
                      disabled={posting || !isOpen}
                      onClick={() => setStatus(o, "done")}
                      className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-50"
                      title="Nur OPEN-Aufträge können erledigt werden"
                    >
                      Erledigt
                    </button>

                    <button
                      disabled={posting || isStorno}
                      onClick={() => setStatus(o, "storno")}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                      title={isDone || isRetour ? "Storno nach DONE (rückbuchen)" : "Auftrag stornieren"}
                    >
                      Stornieren
                    </button>

                    <button
                      disabled={!isDone && !isRetour}
                      onClick={() => handlePrint(o.id)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                      title="Rechnung drucken"
                    >
                      Rechnung drucken
                    </button>
                    <button
                      disabled={!isDone && !isRetour}
                      onClick={() => handleDeliveryPrint(o.id)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                      title="Lieferschein drucken"
                    >
                      Lieferschein
                    </button>
                    <button
                      disabled={o.document_type !== "credit_note"}
                      onClick={() => handleCreditNotePrint(o.id)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                      title="Gutschrift drucken"
                    >
                      Gutschrift
                    </button>
                    <button
                      disabled={(!isDone && !isRetour) || pdfBusyId === o.id}
                      onClick={() =>
                        handlePdfDownload(o.id, o.document_type === "credit_note" ? "credit_note" : "invoice")
                      }
                      className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-50"
                      title="PDF speichern"
                    >
                      {pdfBusyId === o.id ? "PDF wird erzeugt…" : "PDF speichern"}
                    </button>
                    <button
                      disabled={(!isDone && !isRetour) || pdfBusyId === o.id}
                      onClick={() => handlePdfDownload(o.id, "delivery")}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
                      title="Lieferschein als PDF"
                    >
                      Lieferschein PDF
                    </button>
                    {o.document_type === "credit_note" && (
                      <button
                        disabled={pdfBusyId === o.id}
                        onClick={() => handlePdfDownload(o.id, "credit_note")}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
                        title="Gutschrift als PDF"
                      >
                        Gutschrift PDF
                      </button>
                    )}
                    {/* QR-Rechnung ist im PDF integriert */}
                  </div>
                </div>

                {expanded[o.id] && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-100 p-4">
                    <div className="font-semibold mb-2">Positionen</div>

                    {(o.order_lines || []).length === 0 ? (
                      <div className="text-sm text-slate-500">Keine Positionen.</div>
                    ) : (
                      <div className="space-y-2">
                        {(o.order_lines || []).map((l) => {
                          const selected = selectedLineByOrder[o.id] === l.id;
                          const rs = l.return_status || {};
                          const returnedQty = Number(rs.returned_qty || 0);
                          const netQty =
                            rs.net_qty !== undefined && rs.net_qty !== null
                              ? Number(rs.net_qty || 0)
                              : Math.max(Number(l.qty || 0) - returnedQty, 0);
                          const returns = orderReturnsByLineId[l.id] || [];
                          return (
                            <div
                              key={l.id}
                              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                                selected
                                  ? "border-emerald-200 bg-emerald-50"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate text-slate-800">
                                  {l.item?.name || "Artikel"} — qty: {Number(l.qty || 0)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  preis: {formatCHF(l.price_chf)} | position total:{" "}
                                  {formatCHF(Number(l.qty || 0) * Number(l.price_chf || 0))} | lager:{" "}
                                  {Number(l.item?.current_stock || 0)} {l.item?.unit || l.unit || "pcs"}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  ordered: {Number(l.qty || 0)} • returned: {returnedQty} • net: {netQty}
                                </div>
                                {returns.length > 0 && (
                                  <div className="mt-2 text-[11px] text-slate-500 space-y-1">
                                    {returns.slice(0, 5).map((r) => (
                                      <div key={r.id}>
                                        retour: {Number(r.qty)} •{" "}
                                        {r.created_at ? new Date(r.created_at).toLocaleString("de-CH") : ""}
                                        {r.note ? ` • ${r.note}` : ""}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="text-[11px] text-slate-500">
                                  item_id: {l.item_id} • line_id: {l.id}
                                </div>
                              </div>

                              <button
                                onClick={() => selectLine(o.id, l.id)}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-100"
                              >
                                {selected ? "Ausgewählt" : "Auswählen"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Retour */}
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="font-semibold">Retoure buchen</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Hinweis: Die DB verhindert automatisch, dass du mehr retournierst als ausgeliefert wurde.
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr_auto] md:items-end">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Menge</label>
                          <input
                            value={retQty}
                            onChange={(e) => setRetQty(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-slate-300"
                            inputMode="numeric"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Notiz</label>
                          <input
                            value={retNote}
                            onChange={(e) => setRetNote(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-slate-300"
                            placeholder="z.B. beschädigt / Kunde retour"
                          />
                        </div>

                        <button
                          disabled={posting || isStorno || isOpen || (o.order_lines || []).length === 0}
                          onClick={() => bookRetour(o)}
                          className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200 disabled:opacity-50"
                        >
                          Retoure buchen
                        </button>
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        Retour ist sinnvoll nach „Erledigt“ (Ausgang gebucht). Bei „Offen“ blocke ich’s bewusst.
                      </div>
                    </div>

                    {(isRetour || isDone || isStorno) && (
                      <div className="mt-3 text-xs text-slate-500">
                        Status-Info: {isRetour ? "Retoure erfasst." : isDone ? "Auftrag erledigt." : "Auftrag storniert."}
                      </div>
                    )}

                    {/* Bewegungen */}
                    {allMovements.length > 0 && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">Bewegungs-Historie</div>
                          <div className="flex items-center gap-2">
                            <select
                              value={movementFilter}
                              onChange={(e) => setMovementFilter(o.id, e.target.value)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                            >
                              <option value="all">Alle</option>
                              <option value="sale">sale</option>
                              <option value="return">return</option>
                              <option value="cancel">cancel</option>
                              <option value="inventory">inventory</option>
                              <option value="correction">correction</option>
                            </select>
                            <button
                              onClick={() => copyMovementsCsv(o.id)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-100"
                              title="CSV in Zwischenablage kopieren"
                            >
                              CSV kopieren
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {filteredMovements.map((m) => (
                            <div key={m.id} className="flex items-start justify-between gap-3 text-sm">
                              <div className="min-w-0">
                                <div className="text-slate-800">
                                  {m.reason_code || m.movement_type} • {Number(m.qty)} {m.unit || "pcs"}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {m.created_at ? new Date(m.created_at).toLocaleString("de-CH") : ""}
                                  {m.order_line_id ? ` • line: ${m.order_line_id}` : ""}
                                </div>
                              </div>
                              <div className="text-xs text-slate-500">
                                delta: {Number(m.qty_change || 0)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {printOrder && (
        <div className={`print-root ${pdfMode ? "pdf-visible" : ""}`}>
          <div ref={printRef} className="mx-auto max-w-4xl print-page">
            <div className="flex items-start justify-between gap-6">
              <div className="flex flex-col gap-2">
                <div className="print-title">
                  {printDocType === "delivery"
                    ? "Lieferschein"
                    : printDocType === "credit_note"
                    ? "Gutschrift"
                    : "Rechnung"}
                </div>
                <div className="print-meta print-muted">
                  {printDocType === "credit_note"
                    ? `Nr. ${printOrder.credit_note_no || "—"}`
                    : printDocType === "delivery"
                    ? `Nr. ${printOrder.order_no || "—"}`
                    : printOrder.invoice_no
                    ? `Nr. ${printOrder.invoice_no}`
                    : "Ohne Rechnungsnummer"}
                </div>
                <div className="print-meta print-muted">
                  Datum:{" "}
                  {printDocType === "credit_note"
                    ? printOrder.credit_note_date
                      ? new Date(printOrder.credit_note_date).toLocaleDateString("de-CH")
                      : new Date().toLocaleDateString("de-CH")
                    : printDocType === "delivery"
                    ? printOrder.order_date
                      ? new Date(printOrder.order_date).toLocaleDateString("de-CH")
                      : new Date().toLocaleDateString("de-CH")
                    : printOrder.invoice_date
                    ? new Date(printOrder.invoice_date).toLocaleDateString("de-CH")
                    : new Date().toLocaleDateString("de-CH")}
                </div>
                {printDocType === "invoice" && printOrder.due_date ? (
                  <div className="print-meta print-muted">
                    Zahlbar bis: {new Date(printOrder.due_date).toLocaleDateString("de-CH")}
                  </div>
                ) : null}
              </div>

              <div className="text-right text-sm">
                <div className="flex justify-end">
                  <img src="/logo-backoffice.png" alt="Logo" className="h-12 w-auto object-contain" />
                </div>
                <div className="font-semibold">{companyProfile?.legal_name || "Firma"}</div>
                {companyProfile?.trading_name ? <div>{companyProfile.trading_name}</div> : null}
                <div>{companyProfile?.street || ""}</div>
                {companyProfile?.street2 ? <div>{companyProfile.street2}</div> : null}
                <div>
                  {companyProfile?.zip || ""} {companyProfile?.city || ""}
                </div>
                <div>{companyProfile?.country || "CH"}</div>
                {companyProfile?.vat_uid ? <div>MWST‑UID: {companyProfile.vat_uid}</div> : null}
                {companyProfile?.email ? <div>{companyProfile.email}</div> : null}
                {companyProfile?.phone ? <div>{companyProfile.phone}</div> : null}
              </div>
            </div>

            <div className="mt-8 print-card p-4">
              <div className="text-xs uppercase print-muted">
                {printDocType === "delivery" ? "Lieferung an" : "Rechnung an"}
              </div>
              {(() => {
                const c = customers.find((x) => x.id === printOrder.customer_id);
                return (
                  <div className="mt-2 text-sm">
                    <div className="font-semibold">{c?.company_name || "—"}</div>
                    <div>{c?.street || ""}</div>
                    <div>
                      {c?.zip || ""} {c?.city || ""}
                    </div>
                    <div>{c?.country || ""}</div>
                  </div>
                );
              })()}
            </div>

            {printDocType === "delivery" && (
              <div className="mt-4 flex flex-wrap gap-4 text-xs print-muted">
                <div>Bestellnr.: {printOrder.order_no || "—"}</div>
                <div>Auftragsdatum: {printOrder.order_date ? new Date(printOrder.order_date).toLocaleDateString("de-CH") : "—"}</div>
                <div>Leistungsdatum: {printOrder.supply_date ? new Date(printOrder.supply_date).toLocaleDateString("de-CH") : "—"}</div>
              </div>
            )}

            {printDocType === "credit_note" && (
              <div className="mt-4 text-xs print-muted">
                Bezug: Rechnung {printOrder.invoice_no || "—"} vom{" "}
                {printOrder.invoice_date ? new Date(printOrder.invoice_date).toLocaleDateString("de-CH") : "—"}
              </div>
            )}

            <div className="mt-6">
              <div
                className="print-table-head print-muted border-b border-slate-300 pb-2"
                style={{
                  display: "grid",
                  gridTemplateColumns: "30mm 1fr 28mm 30mm 32mm",
                  alignItems: "center",
                }}
              >
                <div>Artikel-Nr.</div>
                <div>Artikel</div>
                <div className="text-right">Menge (Stk)</div>
                <div className="text-right">{printDocType === "delivery" ? "Einheit" : "Preis"}</div>
                <div className="text-right">{printDocType === "delivery" ? "Status" : "Total"}</div>
              </div>
              <div className="divide-y divide-slate-200">
                {(printOrder.order_lines || []).map((l) => (
                  <div
                    key={l.id}
                    className="print-table-row py-2"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "30mm 1fr 28mm 30mm 32mm",
                      alignItems: "center",
                    }}
                  >
                    <div className="text-slate-500">{l.item?.item_no || "—"}</div>
                    <div>{l.item?.name || "Artikel"}</div>
                    <div className="text-right" style={{ whiteSpace: "nowrap" }}>
                      {Number(l.qty || 0)} Stk
                    </div>
                    <div className="text-right" style={{ whiteSpace: "nowrap" }}>
                      {printDocType === "delivery" ? l.unit || l.item?.unit || "pcs" : formatCHF(l.price_chf)}
                    </div>
                    <div className="text-right" style={{ whiteSpace: "nowrap" }}>
                      {printDocType === "delivery"
                        ? "OK"
                        : formatCHF(Number(l.qty || 0) * Number(l.price_chf || 0))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {printDocType !== "delivery" && (
              <div className="mt-6 flex justify-end">
                <div className="w-full max-w-xs text-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 py-1">
                    <span>Netto</span>
                    <span>{printDocType === "credit_note" ? `- ${formatCHF(printOrder.net_total)}` : formatCHF(printOrder.net_total)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-200 py-1">
                    <span>MWST</span>
                    <span>{printDocType === "credit_note" ? `- ${formatCHF(printOrder.vat_total)}` : formatCHF(printOrder.vat_total)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 font-semibold">
                    <span>Brutto</span>
                    <span>{printDocType === "credit_note" ? `- ${formatCHF(printOrder.gross_total)}` : formatCHF(printOrder.gross_total)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 text-xs print-muted">
              {printDocType === "delivery" ? "Lieferdatum: " : "Leistungsdatum: "}
              {printOrder.supply_date
                ? new Date(printOrder.supply_date).toLocaleDateString("de-CH")
                : new Date().toLocaleDateString("de-CH")}
            </div>
            {printDocType === "invoice" && (
              <div className="mt-3 text-xs print-muted">
                Zahlungsziel: {printOrder.payment_terms_days || 30} Tage · IBAN:{" "}
                {companyProfile?.iban || "—"}
              </div>
            )}

            {printDocType === "invoice" && (
              <div className="mt-6 flex items-start justify-between gap-6">
                <div className="print-card p-3">
                  <div className="text-xs print-muted mb-2">QR‑Rechnung</div>
                  {printQrErr ? (
                    <div className="text-xs text-red-700">{printQrErr}</div>
                  ) : printQrDataUrl ? (
                    <img src={printQrDataUrl} alt="QR Rechnung" className="h-32 w-32 object-contain" />
                  ) : (
                    <div className="text-xs print-muted">QR wird erzeugt…</div>
                  )}
                </div>
                <div className="text-xs print-muted flex-1">
                  <div>Betrag: {formatCHF(printOrder.gross_total)}</div>
                  <div>Referenz: {printOrder.invoice_no || "—"}</div>
                  <div>Empfänger: {companyProfile?.legal_name || "—"}</div>
                </div>
              </div>
            )}

            <div className="mt-10 print-footer">
              {companyProfile?.legal_name || "Firma"} · {companyProfile?.street || ""}{" "}
              {companyProfile?.zip || ""} {companyProfile?.city || ""} · {companyProfile?.country || "CH"}
              {companyProfile?.vat_uid ? ` · MWST-UID ${companyProfile.vat_uid}` : ""}
              {companyProfile?.iban ? ` · IBAN ${companyProfile.iban}` : ""}
            </div>

            {printDocType === "delivery" && (
              <div className="mt-8 grid grid-cols-1 gap-6 text-xs print-muted md:grid-cols-2">
                <div>
                  <div>Empfänger</div>
                  <div className="mt-6 border-t border-slate-300 pt-2">Unterschrift / Datum</div>
                </div>
                <div>
                  <div>Lieferant</div>
                  <div className="mt-6 border-t border-slate-300 pt-2">Unterschrift / Datum</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
