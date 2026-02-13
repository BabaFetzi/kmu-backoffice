import { describe, expect, it } from "vitest";
import { buildReorderSuggestions, getDemandStatsByItem } from "./replenishment";

describe("replenishment logic", () => {
  it("aggregates demand by item and offsets return/cancel movements", () => {
    const stats = getDemandStatsByItem([
      { item_id: "i-1", reason_code: "sale", qty: 10 },
      { item_id: "i-1", reason_code: "return", qty: 2 },
      { item_id: "i-1", reason_code: "cancel", qty: 1 },
      { item_id: "i-2", reason_code: "sale", qty: 5 },
      { item_id: "i-2", reason_code: "inventory", qty: 99 },
    ]);

    expect(stats.get("i-1")).toEqual({
      soldQty: 10,
      reversedQty: 3,
      netDemandQty: 7,
    });
    expect(stats.get("i-2")).toEqual({
      soldQty: 5,
      reversedQty: 0,
      netDemandQty: 5,
    });
  });

  it("creates reorder suggestion for item with insufficient stock", () => {
    const rows = buildReorderSuggestions({
      items: [{ id: "i-1", name: "Kabel", unit: "pcs", current_stock: 5 }],
      movements: [{ item_id: "i-1", reason_code: "sale", qty: 30 }],
      lookbackDays: 30,
      leadTimeDays: 14,
      safetyDays: 7,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].reorderQty).toBe(16);
    expect(rows[0].urgency).toBe("high");
    expect(rows[0].coverageDays).toBe(5);
  });

  it("returns no suggestion when net demand does not require replenishment", () => {
    const rows = buildReorderSuggestions({
      items: [{ id: "i-1", name: "Maus", unit: "pcs", current_stock: 10 }],
      movements: [
        { item_id: "i-1", reason_code: "sale", qty: 20 },
        { item_id: "i-1", reason_code: "return", qty: 5 },
        { item_id: "i-1", reason_code: "cancel", qty: 3 },
      ],
      lookbackDays: 30,
      leadTimeDays: 14,
      safetyDays: 7,
    });

    expect(rows).toHaveLength(0);
  });

  it("keeps decimal reorder quantity for non-discrete units", () => {
    const rows = buildReorderSuggestions({
      items: [{ id: "i-1", name: "Granulat", unit: "kg", current_stock: 1.2 }],
      movements: [{ item_id: "i-1", reason_code: "sale", qty: 15 }],
      lookbackDays: 30,
      leadTimeDays: 14,
      safetyDays: 7,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].reorderQty).toBe(9.3);
  });

  it("flags negative stock as critical even without recent demand", () => {
    const rows = buildReorderSuggestions({
      items: [{ id: "i-1", name: "Adapter", unit: "pcs", current_stock: -2 }],
      movements: [],
      lookbackDays: 30,
      leadTimeDays: 14,
      safetyDays: 7,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].reorderQty).toBe(2);
    expect(rows[0].urgency).toBe("critical");
  });
});
