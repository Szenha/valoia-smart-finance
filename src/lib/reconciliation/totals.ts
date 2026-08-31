import type { TxnRow } from "@/lib/finance/types";
import type { StatementItemRow } from "./types";

export function computeReconciliationTotals(items: StatementItemRow[], transactions: TxnRow[]) {
  const transactionsById = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const reviewCount = items.filter((item) => item.status === "review").length;
  const ignoredCount = items.filter((item) => item.status === "ignored").length;
  const comparableItems = items.filter((item) => item.status !== "ignored");
  const linkedItems = comparableItems.filter(
    (item) => item.status === "matched" || item.status === "accepted",
  );

  const statementIncome = comparableItems
    .filter((item) => item.amount > 0)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const statementExpense = comparableItems
    .filter((item) => item.amount < 0)
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  const linkedTransactions = linkedItems
    .map((item) =>
      item.matched_transaction_id ? transactionsById.get(item.matched_transaction_id) : null,
    )
    .filter((transaction): transaction is TxnRow => !!transaction);
  const systemIncome = linkedTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const systemExpense = linkedTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);
  const difference = statementIncome - statementExpense - (systemIncome - systemExpense);

  return {
    pendingCount,
    reviewCount,
    ignoredCount,
    statementIncome,
    statementExpense,
    systemIncome,
    systemExpense,
    difference,
    totalsMatch: pendingCount === 0 && reviewCount === 0 && Math.abs(difference) < 0.005,
  };
}
