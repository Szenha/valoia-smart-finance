import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { TxnRow } from "@/lib/finance/types";
import type { StatementItemRow } from "./types";
import { computeReconciliationTotals } from "./totals";

function item(overrides: Partial<StatementItemRow>): StatementItemRow {
  return {
    id: "item-1",
    statement_import_id: "import-1",
    matched_transaction_id: null,
    line_hash: "hash-1",
    amount: -100,
    description: "Mercado",
    posted_at: "2026-08-10T00:00:00.000Z",
    fit_id: "fit-1",
    type: "DEBIT",
    account_id: "checking-1",
    account_kind: "checking",
    currency: "BRL",
    status: "pending",
    match_confidence: null,
    extraction_confidence: null,
    extraction_source_excerpt: null,
    installment_number: null,
    total_installments: null,
    ...overrides,
  };
}

function txn(overrides: Partial<TxnRow>): TxnRow {
  return {
    id: "txn-1",
    description: "Mercado",
    amount: -100,
    posted_at: "2026-08-10T00:00:00.000Z",
    type: "DEBIT",
    account_id: "checking-1",
    account_kind: "checking",
    payment_method: "debit",
    entry_source: "manual",
    currency: "BRL",
    category_id: null,
    created_by: null,
    statement_import_id: null,
    reconciled_statement_item_id: "item-1",
    recurring_bill_occurrence_id: null,
    installment_number: null,
    installment_plan_id: null,
    classification_method: null,
    classification_confidence: null,
    needs_review: false,
    original_text: null,
    consolidation_status: "aberto",
    period_closure_id: null,
    ...overrides,
  };
}

describe("computeReconciliationTotals", () => {
  test("ignored items do not prevent totals from matching", () => {
    const totals = computeReconciliationTotals(
      [
        item({ id: "matched", matched_transaction_id: "txn-1", status: "matched" }),
        item({ id: "ignored", amount: -999, status: "ignored" }),
      ],
      [txn({ id: "txn-1" })],
    );

    assert.equal(totals.ignoredCount, 1);
    assert.equal(totals.statementExpense, 100);
    assert.equal(totals.systemExpense, 100);
    assert.equal(totals.totalsMatch, true);
  });

  test("review items remain a separate pending condition", () => {
    const totals = computeReconciliationTotals([item({ status: "review" })], []);

    assert.equal(totals.reviewCount, 1);
    assert.equal(totals.totalsMatch, false);
  });
});
