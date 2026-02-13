function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function sanitizeText(value, maxLen = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function splitCsvLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current.trim());
  return result;
}

function detectDelimiter(headerLine) {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;

  candidates.forEach((delim) => {
    const count = (headerLine.match(new RegExp(`\\${delim}`, "g")) || []).length;
    if (count > bestCount) {
      best = delim;
      bestCount = count;
    }
  });

  return best;
}

function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let cleaned = raw.replace(/[^\d.,\-']/g, "");
  cleaned = cleaned.replace(/'/g, "");

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    cleaned = cleaned.replace(",", ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateValue(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  const ymd = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const dmyDots = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDots) {
    const d = String(dmyDots[1]).padStart(2, "0");
    const m = String(dmyDots[2]).padStart(2, "0");
    const y = dmyDots[3];
    return `${y}-${m}-${d}`;
  }

  const dmySlashes = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlashes) {
    const d = String(dmySlashes[1]).padStart(2, "0");
    const m = String(dmySlashes[2]).padStart(2, "0");
    const y = dmySlashes[3];
    return `${y}-${m}-${d}`;
  }

  return null;
}

function findColumn(headers, keys) {
  return headers.findIndex((h) => keys.includes(h));
}

function hasKnownHeaders(normalizedHeaders) {
  const known = [
    "buchungsdatum",
    "valutadatum",
    "date",
    "datum",
    "betrag",
    "amount",
    "credit",
    "debit",
    "gutschrift",
    "lastschrift",
  ];
  return normalizedHeaders.some((h) => known.includes(h));
}

function pickCell(cells, idx) {
  if (idx < 0) return "";
  return cells[idx] || "";
}

export function parseBankCsv(text) {
  const source = String(text || "");
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], errors: ["Datei ist leer."] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitCsvLine(lines[0], delimiter);
  const normalizedHeaders = firstCells.map(normalizeHeader);
  const headerPresent = hasKnownHeaders(normalizedHeaders);

  const headers = headerPresent
    ? normalizedHeaders
    : ["date", "amount", "reference", "message", "counterparty", "currency"];

  const startIndex = headerPresent ? 1 : 0;
  const rows = [];
  const errors = [];

  const idxDate = findColumn(headers, ["buchungsdatum", "valutadatum", "date", "datum", "bookingdate"]);
  const idxAmount = findColumn(headers, ["betrag", "amount", "value"]);
  const idxCredit = findColumn(headers, ["gutschrift", "credit", "eingang"]);
  const idxDebit = findColumn(headers, ["lastschrift", "debit", "ausgang"]);
  const idxRef = findColumn(headers, ["referenz", "reference", "invoice", "beleg", "belegnr"]);
  const idxMsg = findColumn(headers, ["mitteilung", "message", "purpose", "verwendungszweck", "details"]);
  const idxCounterparty = findColumn(headers, ["name", "gegenpartei", "counterparty", "payer", "beguenstigter"]);
  const idxCurrency = findColumn(headers, ["waehrung", "wahrung", "currency", "curr"]);

  for (let i = startIndex; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter);
    const rowNo = i + 1;

    const bookingDate = parseDateValue(pickCell(cells, idxDate));

    let amount = parseAmount(pickCell(cells, idxAmount));
    if (amount === null) {
      const credit = parseAmount(pickCell(cells, idxCredit));
      const debit = parseAmount(pickCell(cells, idxDebit));
      if (credit !== null) amount = credit;
      else if (debit !== null) amount = -Math.abs(debit);
    }

    const reference = sanitizeText(pickCell(cells, idxRef));
    const message = sanitizeText(pickCell(cells, idxMsg), 220);
    const counterparty = sanitizeText(pickCell(cells, idxCounterparty));
    const currency = sanitizeText(pickCell(cells, idxCurrency), 8) || "CHF";

    const parseIssues = [];
    if (!bookingDate) parseIssues.push("Datum fehlt/ungültig");
    if (amount === null) parseIssues.push("Betrag fehlt/ungültig");

    if (parseIssues.length > 0) {
      errors.push(`Zeile ${rowNo}: ${parseIssues.join(", ")}`);
    }

    rows.push({
      id: `bank-${rowNo}`,
      rowNo,
      bookingDate,
      amount,
      currency,
      reference,
      message,
      counterparty,
      parseIssues,
    });
  }

  return { rows, errors };
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function hasToken(text, token) {
  if (!token) return false;
  return normalizeToken(text).includes(normalizeToken(token));
}

function confidenceForStrategy(strategy) {
  if (strategy === "invoice_ref") return 0.98;
  if (strategy === "order_ref") return 0.9;
  if (strategy === "amount") return 0.7;
  return 0;
}

export function buildPaymentMatches({
  bankRows = [],
  openDocuments = [],
  amountTolerance = 0.05,
} = {}) {
  const docs = (openDocuments || [])
    .filter((d) => d?.id && Number(d?.outstandingAmount || 0) > 0)
    .map((d) => ({
      ...d,
      invoiceToken: normalizeToken(d.invoice_no),
      orderToken: normalizeToken(d.order_no),
    }));

  return (bankRows || []).map((row) => {
    const amount = Number(row?.amount);
    const refText = `${row?.reference || ""} ${row?.message || ""}`.toLowerCase();

    if ((row?.parseIssues || []).length > 0 || !row?.bookingDate || !Number.isFinite(amount)) {
      return {
        ...row,
        status: "invalid",
        match: null,
        confidence: 0,
      };
    }

    if (amount <= 0) {
      return {
        ...row,
        status: "ignored",
        match: null,
        confidence: 0,
      };
    }

    const byInvoice = docs.filter((d) => d.invoiceToken && hasToken(refText, d.invoiceToken));
    if (byInvoice.length === 1) {
      return {
        ...row,
        status: "matched",
        match: byInvoice[0],
        strategy: "invoice_ref",
        confidence: confidenceForStrategy("invoice_ref"),
      };
    }
    if (byInvoice.length > 1) {
      return {
        ...row,
        status: "ambiguous",
        match: null,
        strategy: "invoice_ref",
        confidence: 0,
      };
    }

    const byOrder = docs.filter((d) => d.orderToken && hasToken(refText, d.orderToken));
    if (byOrder.length === 1) {
      return {
        ...row,
        status: "matched",
        match: byOrder[0],
        strategy: "order_ref",
        confidence: confidenceForStrategy("order_ref"),
      };
    }
    if (byOrder.length > 1) {
      return {
        ...row,
        status: "ambiguous",
        match: null,
        strategy: "order_ref",
        confidence: 0,
      };
    }

    const byAmount = docs.filter(
      (d) => Math.abs(Number(d.outstandingAmount || 0) - amount) <= amountTolerance
    );
    if (byAmount.length === 1) {
      return {
        ...row,
        status: "matched",
        match: byAmount[0],
        strategy: "amount",
        confidence: confidenceForStrategy("amount"),
      };
    }
    if (byAmount.length > 1) {
      return {
        ...row,
        status: "ambiguous",
        match: null,
        strategy: "amount",
        confidence: 0,
      };
    }

    return {
      ...row,
      status: "unmatched",
      match: null,
      confidence: 0,
    };
  });
}

export function buildBankImportMarker(row) {
  const amountPart = Number.isFinite(Number(row?.amount))
    ? Number(row.amount).toFixed(2)
    : "0.00";
  const raw = [
    "BANKCSV",
    row?.bookingDate || "",
    amountPart,
    sanitizeText(row?.reference || "", 80),
    sanitizeText(row?.message || "", 80),
  ]
    .join("|")
    .toUpperCase();

  return raw.slice(0, 220);
}

export function isBankImportDuplicateError(error) {
  return String(error?.code || "") === "23505";
}

export function resolvePaymentMatch({
  row,
  manualDocId = "",
  openDocuments = [],
} = {}) {
  const base = row || {};
  const status = base.status || "unmatched";
  const canManualAssign = status !== "invalid" && status !== "ignored";

  const manualMatch =
    canManualAssign && manualDocId
      ? (openDocuments || []).find((doc) => doc?.id === manualDocId) || null
      : null;

  if (manualMatch) {
    return {
      ...base,
      resolvedMatch: manualMatch,
      effectiveStatus: "matched",
      isManual: true,
    };
  }

  if (base?.match?.id) {
    return {
      ...base,
      resolvedMatch: base.match,
      effectiveStatus: "matched",
      isManual: false,
    };
  }

  return {
    ...base,
    resolvedMatch: null,
    effectiveStatus: status,
    isManual: false,
  };
}

export function summarizePaymentMatches(rows = []) {
  return (rows || []).reduce(
    (acc, row) => {
      const key = row?.status || "unknown";
      if (acc[key] === undefined) acc[key] = 0;
      acc[key] += 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, matched: 0, unmatched: 0, ambiguous: 0, ignored: 0, invalid: 0 }
  );
}
