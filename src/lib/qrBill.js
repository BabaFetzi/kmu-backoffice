export function buildQrBillPayload({
  iban,
  creditorName,
  creditorStreet,
  creditorStreet2,
  creditorZip,
  creditorCity,
  creditorCountry,
  amount,
  currency,
  debtorName,
  debtorStreet,
  debtorStreet2,
  debtorZip,
  debtorCity,
  debtorCountry,
  reference,
  additionalInfo,
}) {
  const safe = (v) => (v === undefined || v === null ? "" : String(v));
  const addrType = "K"; // combined address

  const lines = [
    "SPC",
    "0200",
    "1",
    safe(iban).replace(/\s+/g, ""),
    addrType,
    safe(creditorName),
    safe(creditorStreet),
    safe(creditorStreet2),
    safe(creditorZip),
    safe(creditorCity),
    safe(creditorCountry || "CH"),
    "", // ultimate creditor: name
    "", // ult addr 1
    "", // ult addr 2
    "", // ult zip
    "", // ult city
    "", // ult country
    amount !== null && amount !== undefined ? Number(amount).toFixed(2) : "",
    safe(currency || "CHF"),
    addrType,
    safe(debtorName),
    safe(debtorStreet),
    safe(debtorStreet2),
    safe(debtorZip),
    safe(debtorCity),
    safe(debtorCountry || "CH"),
    reference ? "SCOR" : "NON",
    safe(reference || ""),
    safe(additionalInfo || ""),
    "EPD",
    "",
    "",
  ];

  return lines.join("\n");
}
