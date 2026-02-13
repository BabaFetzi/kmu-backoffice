import { describe, expect, it } from "vitest";
import {
  buildBankImportMarker,
  buildPaymentMatches,
  isBankImportDuplicateError,
  parseBankCsv,
  resolvePaymentMatch,
  summarizePaymentMatches,
} from "./paymentImport";

describe("payment import helpers", () => {
  it("parses common swiss bank csv format with header", () => {
    const csv = [
      "Buchungsdatum;Betrag;Referenz;Mitteilung;Name",
      "13.02.2026;199.90;INV-1001;Rechnung INV-1001 bezahlt;Kunde AG",
      "14.02.2026;-12.50;;Bankgebühr;Bank",
    ].join("\n");

    const out = parseBankCsv(csv);
    expect(out.errors).toHaveLength(0);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].bookingDate).toBe("2026-02-13");
    expect(out.rows[0].amount).toBe(199.9);
    expect(out.rows[1].amount).toBe(-12.5);
  });

  it("marks invalid rows when date or amount is missing", () => {
    const csv = [
      "Datum;Betrag;Referenz",
      ";100;INV-1",
      "13.02.2026;;INV-2",
    ].join("\n");

    const out = parseBankCsv(csv);
    expect(out.rows).toHaveLength(2);
    expect(out.errors).toHaveLength(2);
    expect(out.rows[0].parseIssues.length).toBeGreaterThan(0);
    expect(out.rows[1].parseIssues.length).toBeGreaterThan(0);
  });

  it("matches by invoice reference with high confidence", () => {
    const rows = buildPaymentMatches({
      bankRows: [
        {
          id: "bank-2",
          rowNo: 2,
          bookingDate: "2026-02-13",
          amount: 120,
          reference: "INV-2026-0042",
          message: "Danke",
          parseIssues: [],
        },
      ],
      openDocuments: [
        {
          id: "order-1",
          invoice_no: "INV-2026-0042",
          order_no: "AUF-99",
          outstandingAmount: 120,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("matched");
    expect(rows[0].strategy).toBe("invoice_ref");
    expect(rows[0].match?.id).toBe("order-1");
  });

  it("falls back to amount matching and marks ambiguous when needed", () => {
    const rows = buildPaymentMatches({
      bankRows: [
        {
          id: "bank-2",
          rowNo: 2,
          bookingDate: "2026-02-13",
          amount: 99.5,
          reference: "",
          message: "",
          parseIssues: [],
        },
      ],
      openDocuments: [
        { id: "order-1", invoice_no: "INV-1", order_no: "AUF-1", outstandingAmount: 99.5 },
        { id: "order-2", invoice_no: "INV-2", order_no: "AUF-2", outstandingAmount: 99.5 },
      ],
    });

    expect(rows[0].status).toBe("ambiguous");
  });

  it("builds stable marker and summary", () => {
    const marker = buildBankImportMarker({
      bookingDate: "2026-02-13",
      amount: 100,
      reference: "inv-1",
      message: "zahlung",
    });
    expect(marker.startsWith("BANKCSV|2026-02-13|100.00|")).toBe(true);

    const summary = summarizePaymentMatches([
      { status: "matched" },
      { status: "matched" },
      { status: "unmatched" },
      { status: "ignored" },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.matched).toBe(2);
    expect(summary.unmatched).toBe(1);
    expect(summary.ignored).toBe(1);
  });

  it("allows manual assignment to resolve ambiguous rows", () => {
    const row = {
      id: "bank-3",
      status: "ambiguous",
      match: null,
    };
    const docs = [
      { id: "o-1", invoice_no: "INV-1", outstandingAmount: 120 },
      { id: "o-2", invoice_no: "INV-2", outstandingAmount: 80 },
    ];
    const resolved = resolvePaymentMatch({
      row,
      manualDocId: "o-2",
      openDocuments: docs,
    });

    expect(resolved.effectiveStatus).toBe("matched");
    expect(resolved.isManual).toBe(true);
    expect(resolved.resolvedMatch?.id).toBe("o-2");
  });

  it("does not allow manual assignment for ignored or invalid rows", () => {
    const ignored = resolvePaymentMatch({
      row: { id: "bank-4", status: "ignored", match: null },
      manualDocId: "o-1",
      openDocuments: [{ id: "o-1" }],
    });
    const invalid = resolvePaymentMatch({
      row: { id: "bank-5", status: "invalid", match: null },
      manualDocId: "o-1",
      openDocuments: [{ id: "o-1" }],
    });

    expect(ignored.effectiveStatus).toBe("ignored");
    expect(ignored.resolvedMatch).toBeNull();
    expect(invalid.effectiveStatus).toBe("invalid");
    expect(invalid.resolvedMatch).toBeNull();
  });

  it("detects duplicate-key errors from bank import apply_payment", () => {
    expect(isBankImportDuplicateError({ code: "23505" })).toBe(true);
    expect(isBankImportDuplicateError({ code: "PGRST116" })).toBe(false);
    expect(isBankImportDuplicateError(null)).toBe(false);
  });
});
