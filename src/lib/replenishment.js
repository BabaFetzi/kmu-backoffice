const DISCRETE_UNITS = new Set([
  "pcs",
  "stk",
  "stk.",
  "piece",
  "pieces",
  "unit",
  "stueck",
  "stück",
]);

function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeReorderQuantity(value, unit) {
  if (!isPositiveNumber(value)) return 0;
  const normalizedUnit = String(unit || "").trim().toLowerCase();
  if (DISCRETE_UNITS.has(normalizedUnit)) {
    return Math.ceil(Number(value));
  }
  return Math.ceil((Number(value) - 1e-9) * 100) / 100;
}

function urgencyLevel({ currentStock, avgDailyDemand, leadTimeDays, reorderQty }) {
  if (!isPositiveNumber(reorderQty)) return "ok";
  if (Number(currentStock || 0) <= 0) return "critical";
  if (!isPositiveNumber(avgDailyDemand)) return "medium";
  const coverageDays = Number(currentStock || 0) / Number(avgDailyDemand || 0);
  if (coverageDays <= Number(leadTimeDays || 0)) return "high";
  return "medium";
}

function urgencyRank(level) {
  if (level === "critical") return 3;
  if (level === "high") return 2;
  if (level === "medium") return 1;
  return 0;
}

export function getDemandStatsByItem(movements = []) {
  const map = new Map();

  (movements || []).forEach((movement) => {
    const itemId = movement?.item_id;
    if (!itemId) return;

    const qty = Number(movement?.qty || 0);
    if (!isPositiveNumber(qty)) return;

    const reason = String(movement?.reason_code || "").toLowerCase();
    if (reason !== "sale" && reason !== "return" && reason !== "cancel") return;

    const prev = map.get(itemId) || {
      soldQty: 0,
      reversedQty: 0,
      netDemandQty: 0,
    };

    if (reason === "sale") {
      prev.soldQty += qty;
      prev.netDemandQty += qty;
    } else {
      prev.reversedQty += qty;
      prev.netDemandQty -= qty;
    }

    map.set(itemId, prev);
  });

  map.forEach((value, key) => {
    map.set(key, {
      soldQty: round(value.soldQty, 2),
      reversedQty: round(value.reversedQty, 2),
      netDemandQty: round(Math.max(0, value.netDemandQty), 2),
    });
  });

  return map;
}

export function buildReorderSuggestions({
  items = [],
  movements = [],
  lookbackDays = 30,
  leadTimeDays = 14,
  safetyDays = 7,
} = {}) {
  const effectiveLookbackDays = isPositiveNumber(lookbackDays) ? Number(lookbackDays) : 30;
  const effectiveLeadTimeDays = isPositiveNumber(leadTimeDays) ? Number(leadTimeDays) : 14;
  const effectiveSafetyDays = isPositiveNumber(safetyDays) ? Number(safetyDays) : 7;

  const demandByItem = getDemandStatsByItem(movements);
  const targetCoverageDays = effectiveLeadTimeDays + effectiveSafetyDays;

  const rows = (items || [])
    .filter((item) => item?.id)
    .map((item) => {
      const stats = demandByItem.get(item.id) || {
        soldQty: 0,
        reversedQty: 0,
        netDemandQty: 0,
      };

      const currentStock = Number(item.current_stock || 0);
      const avgDailyDemand = stats.netDemandQty / effectiveLookbackDays;
      const targetStock = avgDailyDemand * targetCoverageDays;
      const rawReorderQty = targetStock - currentStock;
      const reorderQty = normalizeReorderQuantity(rawReorderQty, item.unit);
      const coverageDays =
        isPositiveNumber(avgDailyDemand) && currentStock > 0
          ? round(currentStock / avgDailyDemand, 1)
          : null;
      const urgency = urgencyLevel({
        currentStock,
        avgDailyDemand,
        leadTimeDays: effectiveLeadTimeDays,
        reorderQty,
      });

      return {
        ...item,
        soldQty: stats.soldQty,
        reversedQty: stats.reversedQty,
        netDemandQty: stats.netDemandQty,
        avgDailyDemand: round(avgDailyDemand, 4),
        targetStock: round(targetStock, 2),
        reorderQty,
        coverageDays,
        urgency,
      };
    })
    .filter((row) => isPositiveNumber(row.reorderQty))
    .sort((a, b) => {
      const byUrgency = urgencyRank(b.urgency) - urgencyRank(a.urgency);
      if (byUrgency !== 0) return byUrgency;

      const byQty = Number(b.reorderQty || 0) - Number(a.reorderQty || 0);
      if (byQty !== 0) return byQty;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  return rows;
}
