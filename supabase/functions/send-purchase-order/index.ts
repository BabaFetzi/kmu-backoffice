// Supabase Edge Function: send purchase order via Resend
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function json(status: number, data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formatCHF(value: number | null | undefined) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return json(500, { error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return json(401, { error: "Unauthorized" });

  const body = await req.json().catch(() => ({}));
  const orderId = body.order_id as string | undefined;
  const toEmail = body.to_email as string | undefined;

  if (!orderId) return json(400, { error: "order_id required" });

  const { data: order, error: orderErr } = await supabase
    .from("purchase_orders")
    .select(
      `
      id, supplier_id, status, order_date, delivery_date, notes, reference_no,
      supplier:suppliers ( id, company_name, email ),
      lines:purchase_order_lines (
        id, item_id, qty, unit, unit_cost, currency,
        item:items ( id, name, unit )
      )
    `
    )
    .eq("id", orderId)
    .eq("created_by", user.id)
    .single();

  if (orderErr || !order) return json(404, { error: "Order not found" });

  if (!Array.isArray(order.lines) || order.lines.length === 0) {
    return json(400, { error: "Order has no lines" });
  }

  const { data: company } = await supabase
    .from("company_profile")
    .select("legal_name, trading_name, street, street2, zip, city, country, vat_uid, email, phone")
    .eq("created_by", user.id)
    .limit(1)
    .maybeSingle();

  const recipient = (toEmail || order.supplier?.email || "").trim();
  if (!recipient) return json(400, { error: "Supplier email missing" });

  const total = order.lines.reduce(
    (sum: number, l: any) => sum + Number(l.qty || 0) * Number(l.unit_cost || 0),
    0
  );

  const linesHtml = order.lines
    .map(
      (l: any) => `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${l.item?.name || "Artikel"}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${Number(l.qty || 0)} ${l.unit || "pcs"}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${formatCHF(l.unit_cost)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${formatCHF(Number(l.qty || 0) * Number(l.unit_cost || 0))}</td>
      </tr>`
    )
    .join("");

  const html = `
  <div style="font-family:Arial, sans-serif; font-size:14px; color:#111;">
    <h2>Bestellung</h2>
    <p>Bitte liefern Sie die folgenden Positionen.</p>
    <p><strong>Liefertermin:</strong> ${order.delivery_date || "—"}</p>
    ${order.reference_no ? `<p><strong>Referenz:</strong> ${order.reference_no}</p>` : ""}
    <table style="width:100%; border-collapse:collapse; margin-top:12px;">
      <thead>
        <tr>
          <th style="text-align:left; padding:6px 8px; border-bottom:2px solid #ccc;">Artikel</th>
          <th style="text-align:right; padding:6px 8px; border-bottom:2px solid #ccc;">Menge</th>
          <th style="text-align:right; padding:6px 8px; border-bottom:2px solid #ccc;">Preis</th>
          <th style="text-align:right; padding:6px 8px; border-bottom:2px solid #ccc;">Summe</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml}
      </tbody>
    </table>
    <p style="text-align:right; margin-top:10px;"><strong>Total:</strong> ${formatCHF(total)}</p>
    <hr style="margin:16px 0;" />
    <div>
      <strong>${company?.legal_name || "Firma"}</strong><br/>
      ${company?.trading_name ? `${company.trading_name}<br/>` : ""}
      ${company?.street || ""} ${company?.street2 || ""}<br/>
      ${company?.zip || ""} ${company?.city || ""}<br/>
      ${company?.country || ""}<br/>
      ${company?.vat_uid ? `MWST-UID: ${company.vat_uid}<br/>` : ""}
      ${company?.email ? `${company.email}<br/>` : ""}
      ${company?.phone ? `${company.phone}` : ""}
    </div>
  </div>
  `;

  const subject = `Bestellung ${order.reference_no ? order.reference_no : order.id}`;

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: recipient,
      subject,
      html,
    }),
  });

  if (!resendResp.ok) {
    const errText = await resendResp.text();
    return json(502, { error: "Resend error", details: errText });
  }

  await supabase
    .from("purchase_orders")
    .update({
      status: "ordered",
      sent_at: new Date().toISOString(),
      sent_to: recipient,
      sent_by: user.id,
    })
    .eq("id", order.id);

  return json(200, { ok: true });
});
