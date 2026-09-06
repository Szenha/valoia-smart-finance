import { competenceMonthDateOnly } from "@/lib/finance/date-utils";
import type { TxnRow } from "@/lib/finance/types";
import { normalizeStatementDescription } from "./dedup";

export type InstallmentProjectionStatus =
  | "detected"
  | "confirmed"
  | "linked"
  | "reconciled"
  | "divergent"
  | "ignored";

export type InstallmentProjectionSourceType =
  | "pdf_card_invoice"
  | "ofx_credit_card"
  | "manual_projection";

export type InstallmentInfo = {
  installmentNumber: number;
  totalInstallments: number;
};

export type InstallmentProjectionDraft = {
  account_id: string;
  account_kind: string;
  source_external_item_id?: string | null;
  reconciliation_period_id?: string | null;
  installment_plan_id?: string | null;
  linked_transaction_id?: string | null;
  description: string;
  normalized_description: string;
  installment_number: number;
  total_installments: number;
  expected_amount: number;
  expected_posted_at: string;
  expected_competence_month: string;
  status: InstallmentProjectionStatus;
  source_type: InstallmentProjectionSourceType;
  projection_fingerprint: string;
};

export type ProjectionTransactionCandidate = Pick<
  TxnRow,
  | "id"
  | "account_id"
  | "account_kind"
  | "amount"
  | "description"
  | "posted_at"
  | "installment_plan_id"
  | "installment_number"
  | "reconciled_statement_item_id"
>;

export type ProjectionMatchDecision =
  | { kind: "none" }
  | { kind: "unique"; transaction: ProjectionTransactionCandidate }
  | { kind: "ambiguous"; transactions: ProjectionTransactionCandidate[] };

function cents(value: number): string {
  return String(Math.round(Math.abs(Number(value)) * 100));
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

function addMonthsClampedDateOnly(dateStr: string, months: number): string {
  const [yearRaw, monthRaw, dayRaw] = dateStr.slice(0, 10).split("-").map(Number);
  const targetMonthIndex = monthRaw - 1 + months;
  const targetYear = yearRaw + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, normalizedMonthIndex + 1, 0),
  ).getUTCDate();
  const target = new Date(
    Date.UTC(targetYear, normalizedMonthIndex, Math.min(dayRaw, daysInTargetMonth)),
  );
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, "0");
  const day = String(target.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validInstallment(number: number, total: number): InstallmentInfo | null {
  if (!Number.isInteger(number) || !Number.isInteger(total)) return null;
  if (number < 1 || total < 2 || number > total || total > 72) return null;
  return { installmentNumber: number, totalInstallments: total };
}

export function detectInstallmentInText(text: string): InstallmentInfo | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const dePattern = /\bPARCELA\s+(\d{1,2})\s+DE\s+(\d{1,2})\b/i.exec(normalized);
  if (dePattern) {
    return validInstallment(Number(dePattern[1]), Number(dePattern[2]));
  }

  const slashPattern = /(?:\bPARC(?:ELA)?\.?\s*)?\b(\d{1,2})\s*\/\s*(\d{1,2})\b/i.exec(normalized);
  if (!slashPattern) return null;
  return validInstallment(Number(slashPattern[1]), Number(slashPattern[2]));
}

export function detectOfxInstallmentInText(text: string): InstallmentInfo | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const dePattern = /\bPARCELA\s+(\d{1,2})\s+DE\s+(\d{1,2})\b/i.exec(normalized);
  if (dePattern) {
    return validInstallment(Number(dePattern[1]), Number(dePattern[2]));
  }

  const slashPattern = /\bPARC(?:ELA)?\.?\s+(\d{1,2})\s*\/\s*(\d{1,2})\b/i.exec(normalized);
  if (!slashPattern) return null;
  return validInstallment(Number(slashPattern[1]), Number(slashPattern[2]));
}

function padInstallment(number: number, width: number): string {
  return String(number).padStart(width, "0");
}

export function descriptionForInstallment(
  description: string,
  installmentNumber: number,
  totalInstallments: number,
): string {
  const slashPattern = /((?:\bPARC(?:ELA)?\.?\s*)?)(\d{1,2})(\s*\/\s*)(\d{1,2})\b/i;
  if (slashPattern.test(description)) {
    return description.replace(slashPattern, (_match, prefix, current, sep, total) => {
      const next = padInstallment(installmentNumber, String(current).length);
      const expectedTotal = padInstallment(totalInstallments, String(total).length);
      return `${prefix}${next}${sep}${expectedTotal}`;
    });
  }

  const dePattern = /\b(PARCELA\s+)(\d{1,2})(\s+DE\s+)(\d{1,2})\b/i;
  if (dePattern.test(description)) {
    return description.replace(dePattern, (_match, prefix, current, sep, total) => {
      const next = padInstallment(installmentNumber, String(current).length);
      const expectedTotal = padInstallment(totalInstallments, String(total).length);
      return `${prefix}${next}${sep}${expectedTotal}`;
    });
  }

  return `${description} ${installmentNumber}/${totalInstallments}`;
}

export function buildProjectionFingerprint(input: {
  accountId: string;
  accountKind: string;
  normalizedDescription: string;
  installmentNumber: number;
  totalInstallments: number;
  expectedAmount: number;
  expectedCompetenceMonth: string;
}): string {
  return stableHash(
    [
      "installment_projection",
      input.accountId,
      input.accountKind,
      input.normalizedDescription,
      input.installmentNumber,
      input.totalInstallments,
      cents(input.expectedAmount),
      input.expectedCompetenceMonth.slice(0, 10),
    ].join("|"),
  );
}

export function buildInstallmentProjectionDrafts(input: {
  accountId: string;
  accountKind: string;
  description: string;
  amount: number;
  postedAt: string;
  installmentNumber: number | null | undefined;
  totalInstallments: number | null | undefined;
  closingDay: number | null | undefined;
  sourceType: InstallmentProjectionSourceType;
  sourceExternalItemId?: string | null;
  reconciliationPeriodId?: string | null;
  installmentPlanId?: string | null;
}): InstallmentProjectionDraft[] {
  const current = input.installmentNumber ?? null;
  const total = input.totalInstallments ?? null;
  if (!current || !total || total < 2 || current >= total) return [];

  const drafts: InstallmentProjectionDraft[] = [];
  for (let number = current + 1; number <= total; number++) {
    const expectedPostedAt = addMonthsClampedDateOnly(
      input.postedAt.slice(0, 10),
      number - current,
    );
    const description = descriptionForInstallment(input.description, number, total);
    const normalizedDescription = normalizeStatementDescription(description);
    const expectedCompetenceMonth = competenceMonthDateOnly(
      expectedPostedAt,
      input.closingDay ?? null,
    );
    drafts.push({
      account_id: input.accountId,
      account_kind: input.accountKind,
      source_external_item_id: input.sourceExternalItemId ?? null,
      reconciliation_period_id: input.reconciliationPeriodId ?? null,
      installment_plan_id: input.installmentPlanId ?? null,
      linked_transaction_id: null,
      description,
      normalized_description: normalizedDescription,
      installment_number: number,
      total_installments: total,
      expected_amount: Math.abs(Number(input.amount)),
      expected_posted_at: expectedPostedAt,
      expected_competence_month: expectedCompetenceMonth,
      status: "detected",
      source_type: input.sourceType,
      projection_fingerprint: buildProjectionFingerprint({
        accountId: input.accountId,
        accountKind: input.accountKind,
        normalizedDescription,
        installmentNumber: number,
        totalInstallments: total,
        expectedAmount: input.amount,
        expectedCompetenceMonth,
      }),
    });
  }
  return drafts;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(Math.abs(Number(a)) - Math.abs(Number(b))) < 0.005;
}

function descriptionsCompatible(a: string, b: string): boolean {
  const left = normalizeStatementDescription(a);
  const right = normalizeStatementDescription(b);
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
}

export function chooseProjectionTransactionMatch(
  projection: Pick<
    InstallmentProjectionDraft,
    | "account_id"
    | "account_kind"
    | "description"
    | "expected_amount"
    | "expected_competence_month"
    | "installment_number"
  >,
  transactions: ProjectionTransactionCandidate[],
  closingDay: number | null | undefined,
): ProjectionMatchDecision {
  const matches = transactions.filter((transaction) => {
    if (transaction.account_id !== projection.account_id) return false;
    if (transaction.account_kind !== projection.account_kind) return false;
    if (transaction.reconciled_statement_item_id) return false;
    if (!sameMoney(transaction.amount, projection.expected_amount)) return false;
    if (
      competenceMonthDateOnly(transaction.posted_at.slice(0, 10), closingDay ?? null) !==
      projection.expected_competence_month
    ) {
      return false;
    }
    if (
      transaction.installment_number != null &&
      transaction.installment_number !== projection.installment_number
    ) {
      return false;
    }
    return descriptionsCompatible(transaction.description, projection.description);
  });

  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "unique", transaction: matches[0] };
  return { kind: "ambiguous", transactions: matches };
}

export type FutureCommitmentSummaryInput = {
  internal: number;
  detected: number;
  confirmed: number;
  linked: number;
  reconciled: number;
  divergent: number;
  ignored: number;
};

export function commitmentWithoutDoubleCount(input: FutureCommitmentSummaryInput): number {
  return input.internal + input.detected + input.confirmed;
}
