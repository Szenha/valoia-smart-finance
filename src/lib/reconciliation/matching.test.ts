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
    account_kind: "credit_card",
    payment_method: "debit",
    entry_source: "manual",
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
    consolidation_status: "aberto",
    period_closure_id: null,
    ...overrides,
  };
}

describe("suggestStatementMatches", () => {
  test("matches exact amount and same date with high confidence", () => {
    const [suggestion] = suggestStatementMatches([item({})], [txn({ account_id: "card" })]);
    assert.equal(suggestion.transactionId, "txn-1");
    assert.equal(suggestion.confidence, 1);
  });

  test("matches exact amount within three days using the nearest candidate", () => {
    const [suggestion] = suggestStatementMatches(
      [item({ posted_at: "2026-07-10T12:00:00.000Z" })],
      [
        txn({ id: "far", account_id: "card", posted_at: "2026-07-12T12:00:00.000Z" }),
        txn({ id: "near", account_id: "card", posted_at: "2026-07-11T12:00:00.000Z" }),
      ],
    );
    assert.equal(suggestion.transactionId, "near");
    assert.equal(suggestion.confidence, 0.9);
  });

  test("does not match different amount or dates outside the window", () => {
    const suggestions = suggestStatementMatches(
      [item({ id: "different-amount" }), item({ id: "far-date" })],
      [
        txn({ id: "amount", account_id: "card", amount: -41 }),
        txn({ id: "date", account_id: "card", posted_at: "2026-07-20T12:00:00.000Z" }),
      ],
    );
    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.transactionId),
      [null, null],
    );
  });

  test("does not suggest imported, already reconciled, or future installment projection rows", () => {
    const suggestions = suggestStatementMatches(
      [item({ id: "imported" }), item({ id: "reconciled" }), item({ id: "projection" })],
      [
        txn({ id: "imported-tx", entry_source: "pdf_import", amount: -42 }),
        txn({ id: "reconciled-tx", reconciled_statement_item_id: "other-item", amount: -42 }),
        txn({
          id: "projection-tx",
          account_id: "card",
          amount: -42,
          installment_plan_id: "plan-1",
          installment_number: 4,
        }),
      ],
    );

    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.transactionId),
      [null, null, null],
    );
  });

  test("suggests a planned installment transaction when the next invoice brings the same parcel", () => {
    const [suggestion] = suggestStatementMatches(
      [
        item({
          description: "Loja PARC 04/05",
          account_id: "card",
          installment_number: 4,
          total_installments: 5,
        }),
      ],
      [
        txn({
          id: "projection-tx",
          description: "Loja PARC 04/05",
          account_id: "card",
          amount: -42,
          installment_plan_id: "plan-1",
          installment_number: 4,
        }),
      ],
    );

    assert.equal(suggestion.transactionId, "projection-tx");
    assert.equal(suggestion.confidence, 1);
  });

  test("does not suggest transactions from another account or card", () => {
    const suggestions = suggestStatementMatches(
      [item({ id: "checking", account_id: "checking-1", account_kind: "checking" })],
      [txn({ id: "card-tx", account_id: "card-1", account_kind: "credit_card" })],
    );

    assert.equal(suggestions[0].transactionId, null);
  });

  test("does not suggest transactions with unrelated description", () => {
    const suggestions = suggestStatementMatches(
      [item({ description: "Mercado", account_id: "card" })],
      [txn({ id: "same-money-date", account_id: "card", description: "Farmacia" })],
    );

    assert.equal(suggestions[0].transactionId, null);
  });

  test("does not suggest transactions already present in active reconciliation links", () => {
    const suggestions = suggestStatementMatches(
      [item({ description: "Mercado", account_id: "card" })],
      [
        txn({
          id: "persistently-linked",
          account_id: "card",
          reconciled_statement_item_id: null,
          statement_import_id: null,
        }),
      ],
      ["persistently-linked"],
    );

    assert.equal(suggestions[0].transactionId, null);
  });
});
