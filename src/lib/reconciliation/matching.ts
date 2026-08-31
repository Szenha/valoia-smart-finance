import type { TxnRow } from "@/lib/finance/types";
import type { MatchSuggestion, StatementItemRow } from "./types";
import { normalizeStatementDescription } from "./dedup";

const MAX_DATE_DISTANCE_DAYS = 3;

function dayKey(dateLike: string) {
  const date = new Date(dateLike);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dateDistanceDays(a: string, b: string) {
  return Math.abs(dayKey(a) - dayKey(b)) / 86_400_000;
}

function sameMoney(a: number, b: number) {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

function sameAccount(txn: TxnRow, item: StatementItemRow) {
  return txn.account_id === item.account_id && txn.account_kind === item.account_kind;
}

function similarDescription(a: string, b: string) {
  const left = normalizeStatementDescription(a);
  const right = normalizeStatementDescription(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function isEligibleReconciliationCandidate(txn: TxnRow): boolean {
  if (txn.reconciled_statement_item_id) return false;
  if (txn.entry_source === "ofx_import" || txn.entry_source === "pdf_import") return false;
  if (txn.statement_import_id) return false;
  if (txn.installment_plan_id && txn.installment_number && !txn.reconciled_statement_item_id) {
    return false;
  }
  return true;
}

export function suggestStatementMatches(
  items: StatementItemRow[],
  transactions: TxnRow[],
  linkedTransactionIds: Iterable<string> = [],
): MatchSuggestion[] {
  const usedTransactions = new Set<string>();
  const alreadyLinkedTransactions = new Set(linkedTransactionIds);
  const suggestions: MatchSuggestion[] = [];

  const pendingItems = items.filter((item) => item.status === "pending");
  for (const item of pendingItems) {
    const candidates = transactions
      .filter(isEligibleReconciliationCandidate)
      .filter((txn) => !usedTransactions.has(txn.id))
      .filter((txn) => !alreadyLinkedTransactions.has(txn.id))
      .filter((txn) => sameAccount(txn, item))
      .filter((txn) => sameMoney(Number(txn.amount), Number(item.amount)))
      .filter((txn) => similarDescription(txn.description, item.description))
      .map((txn) => ({
        txn,
        dateDistance: dateDistanceDays(txn.posted_at, item.posted_at),
      }))
      .filter((candidate) => candidate.dateDistance <= MAX_DATE_DISTANCE_DAYS)
      .sort((a, b) => a.dateDistance - b.dateDistance);

    const best = candidates[0];
    if (!best) {
      suggestions.push({
        itemId: item.id,
        transactionId: null,
        confidence: 0,
        reason:
          "Sem lançamento manual na mesma conta, com descrição parecida e mesmo valor em até 3 dias.",
      });
      continue;
    }

    const confidence = best.dateDistance === 0 ? 1 : best.dateDistance === 1 ? 0.9 : 0.75;
    usedTransactions.add(best.txn.id);
    suggestions.push({
      itemId: item.id,
      transactionId: best.txn.id,
      confidence,
      reason:
        best.dateDistance === 0
          ? "Mesmo valor e mesma data."
          : `Mesmo valor com diferença de ${best.dateDistance} dia(s).`,
    });
  }

  return suggestions;
}
