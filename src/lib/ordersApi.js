import { supabase } from "./supabaseClient";

function prettySupabaseError(error) {
  if (!error) return "";
  return error.message || String(error);
}

/**
 * Order erstellen + Lines erstellen
 * Erwartet: items have fields: id, price, unit
 */
export async function createOrderWithLines({ lines }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Keine Positionen vorhanden.");
  }

  // Order anlegen (status=open)
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({ status: "open", total_chf: 0 })
    .select("id")
    .single();

  if (orderErr) throw new Error(prettySupabaseError(orderErr));

  // Preis/Unit pro Line speichern (Snapshot)
  const orderLinesPayload = lines.map((l) => ({
    order_id: order.id,
    item_id: l.item_id,
    qty: Number(l.qty),
    unit: l.unit || "pcs",
    price_chf: l.price_chf ?? null,
  }));

  const { error: linesErr } = await supabase.from("order_lines").insert(orderLinesPayload);
  if (linesErr) throw new Error(prettySupabaseError(linesErr));

  return order;
}

export async function setOrderStatus(orderId, status) {
  if (status === "done") {
    const { error } = await supabase.rpc("finalize_order", { p_order_id: orderId });
    if (error) throw new Error(prettySupabaseError(error));
    return true;
  }

  if (status === "storno") {
    const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
    if (error) throw new Error(prettySupabaseError(error));
    return true;
  }

  throw new Error(`Unbekannter Status: ${status}`);
}

export async function markOrderDone(orderId) {
  return setOrderStatus(orderId, "done");
}

export async function cancelOrder(orderId) {
  return setOrderStatus(orderId, "storno");
}

export async function cancelOrderAfterDone(orderId) {
  const { error } = await supabase.rpc("cancel_order_after_done", { p_order_id: orderId });
  if (error) throw new Error(prettySupabaseError(error));
  return true;
}

/**
 * Retouren Movement über RPC (wie du es bereits hast)
 * RPC Name: create_return_movement
 */
export async function createReturnMovement(orderId, orderLineId, qty, notes = "") {
  const q = Number(qty);
  if (!orderId) throw new Error("orderId fehlt");
  if (!orderLineId) throw new Error("orderLineId fehlt");
  if (!Number.isFinite(q) || q <= 0) throw new Error("Menge muss > 0 sein");

  const { data, error } = await supabase.rpc("book_return", {
    p_order_line_id: orderLineId,
    p_qty: q,
    p_note: notes || "",
  });

  if (error) throw new Error(prettySupabaseError(error));
  return data; // meist Movement-ID
}
