import type { AccountKind } from "@/lib/finance/types";
import type { StatementItemStatus } from "./types";
import { normalizeStatementDescription } from "./dedup";

export type PersistentScopeType = "account_statement" | "card_invoice";
export type ExternalSourceType = "ofx_checking" | "ofx_credit_card" | "pdf_card_invoice";
export type ReconciliationLinkStatus =
  | "matched"
  | "accepted_new"
  | "edited_existing"
  | "ignored"
  | "review";

export type PersistentLineInput = {
  sourceType: ExternalSourceType;
  accountId: string;
  accountKind: AccountKind | string;
  postedAt: string;
  amount: number;
  description: string;
  fitId?: string | null;
  lineHash?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
};

export type PersistentPeriodInput = {
  scopeType: PersistentScopeType;
  accountId: string;
  accountKind: AccountKind | string;
  periodStart: string;
  periodEnd: string;
  competencePeriod: string;
};

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function monthStart(value: string): string {
  return `${dateOnly(value).slice(0, 7)}-01`;
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

export function sourceTypeForImport(
  source: "ofx" | "pdf",
  accountKind: AccountKind | string,
): ExternalSourceType {
  if (source === "pdf") return "pdf_card_invoice";
  return accountKind === "credit_card" ? "ofx_credit_card" : "ofx_checking";
}

export function buildSourceFingerprint(input: PersistentLineInput): string {
  return stableHash(
    [
      "source",
      input.sourceType,
      input.accountId,
      input.accountKind,
      dateOnly(input.postedAt),
      cents(input.amount),
      normalizeStatementDescription(input.description),
      input.fitId?.trim() || "no-fitid",
      input.lineHash?.trim() || "no-linehash",
      input.installmentNumber ?? "no-installment",
      input.totalInstallments ?? "no-total-installments",
    ].join("|"),
  );
}

export function buildReconciliationFingerprint(input: PersistentLineInput): string {
  return stableHash(
    [
      "reconciliation",
      input.accountId,
      input.accountKind,
      dateOnly(input.postedAt),
      cents(input.amount),
      normalizeStatementDescription(input.description),
      input.installmentNumber ?? "no-installment",
      input.totalInstallments ?? "no-total-installments",
    ].join("|"),
  );
}

export function periodFromLines(
  lines: Pick<PersistentLineInput, "postedAt" | "accountId" | "accountKind">[],
  scopeType: PersistentScopeType,
  fallback?: { periodStart?: string | null; periodEnd?: string | null },
): PersistentPeriodInput {
  if (lines.length === 0) throw new Error("Não há linhas para criar período de conciliação.");
  const sortedDates = lines.map((line) => dateOnly(line.postedAt)).sort();
  const periodStart = fallback?.periodStart ? dateOnly(fallback.periodStart) : sortedDates[0];
  const periodEnd = fallback?.periodEnd
    ? dateOnly(fallback.periodEnd)
    : sortedDates[sortedDates.length - 1];
  return {
    scopeType,
    accountId: lines[0].accountId,
    accountKind: lines[0].accountKind,
    periodStart,
    periodEnd,
    competencePeriod: monthStart(periodStart),
  };
}

export function statusFromPersistentItem(
  currentStatus: StatementItemStatus,
  persistentStatus?: StatementItemStatus | null,
): StatementItemStatus {
  if (!persistentStatus || persistentStatus === "pending") return currentStatus;
  return persistentStatus;
}

export function legacyStatusFromLinkStatus(
  currentStatus: StatementItemStatus,
  linkStatus?: ReconciliationLinkStatus | null,
  persistentStatus?: StatementItemStatus | null,
): StatementItemStatus {
  if (linkStatus === "accepted_new") return "accepted";
  if (linkStatus === "edited_existing") return "matched";
  if (linkStatus) return linkStatus;
  return statusFromPersistentItem(currentStatus, persistentStatus);
}
