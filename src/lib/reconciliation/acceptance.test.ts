import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { TxnRow } from "@/lib/finance/types";
import type { StatementItemRow } from "./types";
import {
  RECONCILIATION_STALE_TRANSACTION_MESSAGE,
  buildFutureInstallmentFitId,
  chooseDuplicateCandidate,
  isReconciliationComplete,
  remainingInstallmentNumbers,
  requireSingleUpdatedTransaction,
  shouldReuseInstallmentProjection,
} from "./acceptance";

function txn(overrides: Partial<TxnRow>): TxnRow {
  return {
    id: "txn-1",
    description: "Loja Parc 03/05",
    amount: -100,
    posted_at: "2026-04-10T00:00:00.000Z",
    type: "DEBIT",
    account_id: "card-1",
    account_kind: "credit_card",
    payment_method: "credit_card",
    entry_source: "manual",
    currency: "BRL",
    category_id: null,
    created_by: null,
    statement_import_id: null,
    reconciled_statement_item_id: null,
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

function item(overrides: Partial<StatementItemRow>): StatementItemRow {
  return {
    id: "item-1",
    statement_import_id: "import-1",
    matched_transaction_id: null,
    line_hash: "hash-1",
    amount: -100,
    description: "Loja Parc 02/05",
    posted_at: "2026-03-10T00:00:00.000Z",
    fit_id: "pdf-hash-1",
    type: "DEBIT",
    account_id: "card-1",
    account_kind: "credit_card",
    currency: "BRL",
    status: "pending",
    match_confidence: null,
    extraction_confidence: null,
    extraction_source_excerpt: null,
    installment_number: 2,
    total_installments: 5,
    ...overrides,
  };
}

describe("reconciliation acceptance helpers", () => {
  test("does not choose arbitrarily when two duplicate candidates remain possible", () => {
    const decision = chooseDuplicateCandidate(
      [txn({ id: "a" }), txn({ id: "b" })],
      "LOJA PARC 03/05",
    );

    assert.equal(decision.kind, "ambiguous");
  });

  test("ignores reconciled or import-linked rows when choosing duplicate candidate", () => {
    const decision = chooseDuplicateCandidate(
      [
        txn({ id: "reconciled", reconciled_statement_item_id: "other-item" }),
        txn({ id: "imported", statement_import_id: "import-1" }),
      ],
      "Loja Parc 03/05",
    );

    assert.equal(decision.kind, "none");
  });

  test("treats a unique manual simple transaction as a reusable installment candidate", () => {
    const decision = chooseDuplicateCandidate(
      [txn({ installment_plan_id: null })],
      "Loja Parc 03/05",
    );

    assert.equal(decision.kind, "unique");
    if (decision.kind === "unique") assert.equal(decision.transaction.id, "txn-1");
  });

  test("requires manual choice when an installment has multiple manual candidates", () => {
    const decision = chooseDuplicateCandidate(
      [txn({ id: "a", installment_plan_id: null }), txn({ id: "b", installment_plan_id: null })],
      "Loja Parc 03/05",
    );

    assert.equal(decision.kind, "ambiguous");
  });

  test("aborts stale reconciliation updates when no transaction row was changed", () => {
    assert.throws(
      () => requireSingleUpdatedTransaction([]),
      new RegExp(RECONCILIATION_STALE_TRANSACTION_MESSAGE),
    );
  });

  test("creates stable future installment keys from plan id and installment number", () => {
    assert.equal(buildFutureInstallmentFitId("plan-1", 4), "FUTURE-plan-1-4");
    assert.equal(buildFutureInstallmentFitId("plan-1", 5), "FUTURE-plan-1-5");
  });

  test("importing invoice 2/5 projects 3, 4, 5 and invoice 3/5 projects only 4, 5", () => {
    assert.deepEqual(remainingInstallmentNumbers(item({ installment_number: 2 })), [3, 4, 5]);
    assert.deepEqual(remainingInstallmentNumbers(item({ installment_number: 3 })), [4, 5]);
  });

  test("accepting real installment can reuse the existing projection for the same plan number", () => {
    assert.equal(
      shouldReuseInstallmentProjection(
        txn({ installment_plan_id: "plan-1", installment_number: 3 }),
        "plan-1",
        3,
      ),
      true,
    );
    assert.equal(
      shouldReuseInstallmentProjection(
        txn({
          installment_plan_id: "plan-1",
          installment_number: 3,
          reconciled_statement_item_id: "other-item",
        }),
        "plan-1",
        3,
      ),
      false,
    );
  });

  test("does not consider reconciliation complete while an item is in review", () => {
    assert.equal(isReconciliationComplete([item({ status: "review" })]), false);
    assert.equal(isReconciliationComplete([item({ status: "pending" })]), false);
    assert.equal(isReconciliationComplete([item({ status: "matched" })]), true);
  });
});
