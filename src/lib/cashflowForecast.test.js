import { describe, expect, it } from "vitest";
import { buildCashflowForecast, parseDateOnly, sumPurchaseOrderAmount } from "./cashflowForecast";

describe("cashflow forecast", () => {
  it("parses yyyy-mm-dd values safely", () => {
    const d = parseDateOnly("2026-02-13T18:00:00.000Z");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(1);
    expect(d?.getDate()).toBe(13);
    expect(parseDateOnly("not-a-date")).toBeNull();
  });

  it("sums purchase order line amounts", () => {
    const total = sumPurchaseOrderAmount({
      lines: [
        { qty: 2, unit_cost: 50 },
        { qty: 1.5, unit_cost: 10 },
      ],
    });
    expect(total).toBe(115);
  });

  it("builds 30-day forecast from receivables and purchase commitments", () => {
    const forecast = buildCashflowForecast({
      today: new Date(2026, 1, 13),
      horizonDays: 30,
      agingRows: [
        { due_date: "2026-02-10", gross_total: 100 },
        { due_date: "2026-02-20", gross_total: 200 },
        { due_date: "2026-03-20", gross_total: 300 },
      ],
      purchaseOrders: [
        {
          status: "open",
          delivery_date: "2026-02-18",
          lines: [
            { qty: 2, unit_cost: 50 },
            { qty: 1, unit_cost: 20 },
          ],
        },
        {
          status: "ordered",
          delivery_date: "2026-03-14",
          lines: [{ qty: 1, unit_cost: 70 }],
        },
        {
          status: "open",
          delivery_date: "2026-03-25",
          lines: [{ qty: 5, unit_cost: 10 }],
        },
        {
          status: "received",
          delivery_date: "2026-02-19",
          lines: [{ qty: 1, unit_cost: 500 }],
        },
        {
          status: "open",
          delivery_date: null,
          lines: [{ qty: 2, unit_cost: 30 }],
        },
      ],
    });

    expect(forecast.incoming30).toBe(300);
    expect(forecast.overdueReceivables).toBe(100);
    expect(forecast.outgoing30).toBe(190);
    expect(forecast.net30).toBe(110);
    expect(forecast.openPurchaseOrders).toBe(4);
    expect(forecast.missingDeliveryDate).toBe(1);
  });

  it("handles empty input deterministically", () => {
    const forecast = buildCashflowForecast({
      today: new Date(2026, 1, 13),
      horizonDays: 30,
      agingRows: [],
      purchaseOrders: [],
    });

    expect(forecast.incoming30).toBe(0);
    expect(forecast.outgoing30).toBe(0);
    expect(forecast.net30).toBe(0);
    expect(forecast.overdueReceivables).toBe(0);
    expect(forecast.openPurchaseOrders).toBe(0);
    expect(forecast.missingDeliveryDate).toBe(0);
  });
});
