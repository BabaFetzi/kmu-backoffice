import { useMemo } from "react";

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-CH");
}

export default function DunningLetterPreview({ template, doc, company }) {
  const body = useMemo(() => {
    if (!template?.body) return "";
    const replacements = {
      "{{due_date}}": formatDate(doc?.due_date),
      "{{invoice_no}}": doc?.invoice_no || "—",
      "{{customer_name}}": doc?.customers?.company_name || "—",
      "{{amount}}": doc?.gross_total ? `CHF ${Number(doc.gross_total).toFixed(2)}` : "CHF 0.00",
    };
    return Object.entries(replacements).reduce((acc, [key, val]) => acc.split(key).join(val), template.body);
  }, [template, doc]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <div className="text-xs text-slate-500">Vorschau Mahnbrief</div>
      <div className="mt-2 font-semibold">{template?.title || "Mahnung"}</div>
      <div className="mt-2 text-xs text-slate-500">
        {company?.legal_name || "Firma"} · {company?.city || ""}
      </div>
      <div className="mt-3 space-y-2">
        <div>Empfänger: {doc?.customers?.company_name || "—"}</div>
        <div>Beleg: {doc?.invoice_no || "—"}</div>
        <div>Fällig: {formatDate(doc?.due_date)}</div>
        <div>Betrag: {doc?.gross_total ? `CHF ${Number(doc.gross_total).toFixed(2)}` : "CHF 0.00"}</div>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm">{body}</div>
    </div>
  );
}
