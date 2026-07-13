import type { TxnRow } from "@/lib/finance/types";
import type { MatchSuggestion, StatementItemRow } from "./types";

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

export function suggestStatementMatches(
  items: StatementItemRow[],
  transactions: TxnRow[],
): MatchSuggestion[] {
  const usedTransactions = new Set<string>();
  const suggestions: MatchSuggestion[] = [];

  const pendingItems = items.filter((item) => item.status === "pending");
  for (const item of pendingItems) {
    const candidates = transactions
      .filter((txn) => !txn.reconciled_statement_item_id)
      .filter((txn) => !usedTransactions.has(txn.id))
      .filter((txn) => sameMoney(Number(txn.amount), Number(item.amount)))
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
        reason: "Sem lançamento manual com mesmo valor em até 3 dias.",
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
