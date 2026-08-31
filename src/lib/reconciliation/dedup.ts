export type ImportLineInput = {
  source: "ofx" | "pdf";
  accountId: string;
  accountKind: string;
  postedAt: string;
  amount: number;
  description: string;
  fitId?: string | null;
  occurrence?: number;
};

export type PdfLikeTransaction = {
  date: string;
  amount: number;
  description: string;
  source_excerpt?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  confidence?: number | null;
};

export function normalizeStatementDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function cents(value: number): string {
  return String(Math.round(Number(value) * 100));
}

function stableHash(seed: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildStatementLineHash(input: ImportLineInput): string {
  const normalized = normalizeStatementDescription(input.description);
  const fitPart = input.fitId?.trim() ? input.fitId.trim() : "no-fitid";
  const occurrence = input.occurrence ?? 1;
  return stableHash(
    [
      input.source,
      input.accountId,
      input.accountKind,
      dateOnly(input.postedAt),
      cents(input.amount),
      normalized,
      fitPart,
      occurrence,
    ].join("|"),
  );
}

export async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function dedupePdfTransactions<T extends PdfLikeTransaction>(transactions: T[]): T[] {
  const seenExact = new Set<string>();
  const output: T[] = [];
  for (const transaction of transactions) {
    const exactKey = [
      transaction.date,
      cents(transaction.amount),
      normalizeStatementDescription(transaction.description),
      normalizeStatementDescription(transaction.source_excerpt ?? ""),
    ].join("|");
    if (seenExact.has(exactKey)) continue;
    seenExact.add(exactKey);
    output.push(transaction);
  }
  return output;
}

export function assignOccurrences<T extends ImportLineInput>(
  lines: T[],
): (T & { occurrence: number })[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const key = [
      line.source,
      line.accountId,
      line.accountKind,
      dateOnly(line.postedAt),
      cents(line.amount),
      normalizeStatementDescription(line.description),
      line.fitId?.trim() || "no-fitid",
    ].join("|");
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return { ...line, occurrence };
  });
}
