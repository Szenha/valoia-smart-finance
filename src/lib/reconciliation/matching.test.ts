import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { TxnRow } from "@/lib/finance/types";
import { suggestStatementMatches } from "./matching";
import type { StatementItemRow } from "./types";

function item(overrides: Partial<StatementItemRow>): StatementItemRow {
  return {
    id: "item-1",
    statement_import_id: "import-1",
    matched_transaction_id: null,
    amount: -42,
    description: "Mercado",
    posted_at: "2026-07-10T12:00:00.000Z",
    fit_id: "fit-1",
    type: "DEBIT",
    account_id: "card",
    account_kind: "credit_card",
    currency: "BRL",
    status: "pending",
    match_confidence: null,
    extraction_confidence: null,
    extraction_source_excerpt: null,
    ...overrides,
  };
}

function txn(overrides: Partial<TxnRow>): TxnRow {
  return {
    id: "txn-1",
    description: "Mercado",
    amount: -42,
    posted_at: "2026-07-10T12:00:00.000Z",
    type: "MANUAL_DEBIT",
    account_id: "manual-cash",
    account_kind: "checking",
    currency: "BRL",
    category_id: null,
    created_by: null,
    statement_import_id: null,
    reconciled_statement_item_id: null,
    installment_number: null,
    installment_plan_id: null,
    classification_method: null,
    classification_confidence: null,
    needs_review: false,
    original_text: null,
    ...overrides,
  };
}

describe("suggestStatementMatches", () => {
  test("matches exact amount and same date with high confidence", () => {
    const [suggestion] = suggestStatementMatches([item({})], [txn({})]);
    assert.equal(suggestion.transactionId, "txn-1");
    assert.equal(suggestion.confidence, 1);
  });

  test("matches exact amount within three days using the nearest candidate", () => {
    const [suggestion] = suggestStatementMatches(
      [item({ posted_at: "2026-07-10T12:00:00.000Z" })],
      [
        txn({ id: "far", posted_at: "2026-07-12T12:00:00.000Z" }),
        txn({ id: "near", posted_at: "2026-07-11T12:00:00.000Z" }),
      ],
    );
    assert.equal(suggestion.transactionId, "near");
    assert.equal(suggestion.confidence, 0.9);
  });

  test("does not match different amount or dates outside the window", () => {
    const suggestions = suggestStatementMatches(
      [item({ id: "different-amount" }), item({ id: "far-date" })],
      [
        txn({ id: "amount", amount: -41 }),
        txn({ id: "date", posted_at: "2026-07-20T12:00:00.000Z" }),
      ],
    );
    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.transactionId),
      [null, null],
    );
  });
});
