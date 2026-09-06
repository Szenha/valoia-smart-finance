const DATE_BR_RE = /(\d{2})\/(\d{2})\/(\d{4})/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateOnlyFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function inferPdfInvoiceClosingDate(text: string): string | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = /Fatura fechada em\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(normalized);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw] = match;
  return dateOnlyFromParts(Number(yearRaw), Number(monthRaw), Number(dayRaw));
}

export function anchorPdfTransactionDateToClosingDate(
  transactionDate: string,
  closingDate: string | null,
): string {
  if (!closingDate) return transactionDate;

  const dateMatch = DATE_BR_RE.exec(transactionDate);
  const parsed = new Date(transactionDate);
  if (!dateMatch && Number.isNaN(parsed.getTime())) return transactionDate;
  const month = dateMatch ? Number(dateMatch[2]) : parsed.getUTCMonth() + 1;
  const day = dateMatch ? Number(dateMatch[1]) : parsed.getUTCDate();
  const closing = new Date(`${closingDate}T00:00:00.000Z`);
  let year = closing.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate > closing) {
    year -= 1;
    candidate = new Date(Date.UTC(year, month - 1, day));
  }
  return candidate.toISOString().slice(0, 10);
}
