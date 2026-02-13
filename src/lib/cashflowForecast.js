function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-").map((v) => Number(v));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + Number(days || 0));
  return out;
}

export function sumPurchaseOrderAmount(order) {
  return round(
    (order?.lines || []).reduce((sum, line) => {
      const qty = Number(line?.qty || 0);
      const unitCost = Number(line?.unit_cost || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) return sum;
      return sum + qty * unitCost;
    }, 0),
    2
  );
}

export function buildCashflowForecast({
  agingRows = [],
  purchaseOrders = [],
  today = new Date(),
  horizonDays = 30,
} = {}) {
  const start = dateOnly(today);
  const end = addDays(start, horizonDays);

  let incoming30 = 0;
  let overdueReceivables = 0;

  (agingRows || []).forEach((row) => {
    const amount = Number(row?.gross_total || 0);
    const dueDate = parseDateOnly(row?.due_date);
    if (!Number.isFinite(amount) || !dueDate) return;

    if (dueDate < start) {
      overdueReceivables += amount;
    }
    if (dueDate <= end) {
      incoming30 += amount;
    }
  });

  let outgoing30 = 0;
  let openPurchaseOrders = 0;
  let missingDeliveryDate = 0;

  (purchaseOrders || []).forEach((order) => {
    const status = String(order?.status || "").toLowerCase();
    if (status !== "open" && status !== "ordered") return;
    openPurchaseOrders += 1;

    const deliveryDate = parseDateOnly(order?.delivery_date);
    if (!deliveryDate) {
      missingDeliveryDate += 1;
      return;
    }

    if (deliveryDate <= end) {
      outgoing30 += sumPurchaseOrderAmount(order);
    }
  });

  const incoming = round(incoming30, 2);
  const outgoing = round(outgoing30, 2);

  return {
    horizonStart: start,
    horizonEnd: end,
    incoming30: incoming,
    overdueReceivables: round(overdueReceivables, 2),
    outgoing30: outgoing,
    net30: round(incoming - outgoing, 2),
    openPurchaseOrders,
    missingDeliveryDate,
  };
}
