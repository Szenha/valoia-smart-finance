import type { TxnRow } from "@/lib/finance/types";
import type { StatementItemRow } from "./types";
import { normalizeStatementDescription } from "./dedup";

export type DuplicateCandidateDecision =
  | { kind: "none" }
  | { kind: "unique"; transaction: TxnRow }
  | { kind: "ambiguous"; transactions: TxnRow[] };

export const RECONCILIATION_STALE_TRANSACTION_MESSAGE =
  "Essa transação já foi conciliada. Atualize a tela e tente novamente.";

export function requireSingleUpdatedTransaction<T>(rows: T[] | null | undefined): T {
  if ((rows ?? []).length !== 1) {
    throw new Error(RECONCILIATION_STALE_TRANSACTION_MESSAGE);
  }
  return rows![0];
}

export function sameReconciliationDescription(a: string, b: string): boolean {
  return normalizeStatementDescription(a) === normalizeStatementDescription(b);
}

export function chooseDuplicateCandidate(
  candidates: TxnRow[],
  description: string,
): DuplicateCandidateDecision {
  const eligible = candidates.filter(
    (candidate) =>
      !candidate.reconciled_statement_item_id &&
      !candidate.statement_import_id &&
      candidate.entry_source !== "ofx_import" &&
      candidate.entry_source !== "pdf_import" &&
      sameReconciliationDescription(candidate.description, description),
  );
  if (eligible.length === 0) return { kind: "none" };
  if (eligible.length === 1) return { kind: "unique", transaction: eligible[0] };
  return { kind: "ambiguous", transactions: eligible };
}

export function isReconciliationComplete(items: StatementItemRow[]): boolean {
  return (
    items.length > 0 && items.every((item) => item.status !== "pending" && item.status !== "review")
  );
}

export function installmentConflictMessage(count: number): string {
  return `Encontrei ${count} lançamentos possíveis com mesma data, valor e descrição. Escolha manualmente qual conciliar ou ajuste a descrição/data antes de aceitar.`;
}

export function buildFutureInstallmentFitId(planId: string, installmentNumber: number): string {
  return `FUTURE-${planId}-${installmentNumber}`;
}

export function shouldReuseInstallmentProjection(
  transaction: Pick<
    TxnRow,
    "installment_plan_id" | "installment_number" | "reconciled_statement_item_id"
  >,
  planId: string,
  installmentNumber: number,
): boolean {
  return (
    transaction.installment_plan_id === planId &&
    transaction.installment_number === installmentNumber &&
    !transaction.reconciled_statement_item_id
  );
}

export function remainingInstallmentNumbers(item: StatementItemRow): number[] {
  if (!item.installment_number || !item.total_installments) return [];
  const numbers: number[] = [];
  for (let number = item.installment_number + 1; number <= item.total_installments; number++) {
    numbers.push(number);
  }
  return numbers;
}
