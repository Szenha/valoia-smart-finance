import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { TxnRow } from "@/lib/finance/types";
import {
  buildInstallmentProjectionDrafts,
  chooseProjectionTransactionMatch,
  commitmentWithoutDoubleCount,
  descriptionForInstallment,
  detectOfxInstallmentInText,
  detectInstallmentInText,
} from "./installment-projections";

function txn(overrides: Partial<TxnRow>): TxnRow {
  return {
    id: "txn-1",
    description: "Loja PARC 02/05",
    amount: -100,
    posted_at: "2026-09-10T00:00:00.000Z",
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
    installment_number: 2,
    installment_plan_id: "plan-1",
    classification_method: null,
    classification_confidence: null,
    needs_review: false,
    original_text: null,
    consolidation_status: "aberto",
    period_closure_id: null,
    ...overrides,
  };
}

describe("installment projections", () => {
  test("PDF item 1/5 creates projections 2/5..5/5 without transaction payloads", () => {
    const drafts = buildInstallmentProjectionDrafts({
      accountId: "card-1",
      accountKind: "credit_card",
      description: "Loja A PARC 01/05",
      amount: -100,
      postedAt: "2026-08-10T00:00:00.000Z",
      installmentNumber: 1,
      totalInstallments: 5,
      closingDay: 25,
      sourceType: "pdf_card_invoice",
      sourceExternalItemId: "external-1",
      reconciliationPeriodId: "period-1",
    });

    assert.deepEqual(
      drafts.map((draft) => draft.installment_number),
      [2, 3, 4, 5],
    );
    assert.equal(drafts[0].description, "Loja A PARC 02/05");
    assert.equal(drafts[0].linked_transaction_id, null);
    assert.equal(drafts[0].status, "detected");
  });

  test("permissive text detection keeps accepting already classified installment text", () => {
    assert.deepEqual(detectInstallmentInText("LOJA 1/5"), {
      installmentNumber: 1,
      totalInstallments: 5,
    });
  });

  test("OFX descriptions detect installments only with explicit context", () => {
    assert.deepEqual(detectOfxInstallmentInText("LOJA PARC 02/05"), {
      installmentNumber: 2,
      totalInstallments: 5,
    });
    assert.deepEqual(detectOfxInstallmentInText("LOJA PARC. 02/05"), {
      installmentNumber: 2,
      totalInstallments: 5,
    });
    assert.deepEqual(detectOfxInstallmentInText("LOJA PARCELA 2 DE 5"), {
      installmentNumber: 2,
      totalInstallments: 5,
    });
    assert.equal(detectOfxInstallmentInText("LOJA 01/05"), null);
    assert.equal(detectOfxInstallmentInText("DATA 10/09"), null);
    assert.equal(detectOfxInstallmentInText("CODIGO 123/45 REF 678"), null);
  });

  test("projection fingerprint is stable across overlapping imports", () => {
    const [first] = buildInstallmentProjectionDrafts({
      accountId: "card-1",
      accountKind: "credit_card",
      description: "Loja B PARC 02/05",
      amount: -50,
      postedAt: "2026-08-12T00:00:00.000Z",
      installmentNumber: 2,
      totalInstallments: 5,
      closingDay: 20,
      sourceType: "pdf_card_invoice",
      sourceExternalItemId: "external-1",
    });
    const [second] = buildInstallmentProjectionDrafts({
      accountId: "card-1",
      accountKind: "credit_card",
      description: "Loja B PARC 02/05",
      amount: -50,
      postedAt: "2026-08-12T00:00:00.000Z",
      installmentNumber: 2,
      totalInstallments: 5,
      closingDay: 20,
      sourceType: "ofx_credit_card",
      sourceExternalItemId: "external-2",
    });

    assert.equal(first.projection_fingerprint, second.projection_fingerprint);
  });

  test("projection links a single compatible future transaction", () => {
    const [projection] = buildInstallmentProjectionDrafts({
      accountId: "card-1",
      accountKind: "credit_card",
      description: "Loja PARC 01/05",
      amount: -100,
      postedAt: "2026-08-10T00:00:00.000Z",
      installmentNumber: 1,
      totalInstallments: 5,
      closingDay: 25,
      sourceType: "pdf_card_invoice",
    });

    const decision = chooseProjectionTransactionMatch(projection, [txn({})], 25);

    assert.equal(decision.kind, "unique");
    if (decision.kind === "unique") assert.equal(decision.transaction.id, "txn-1");
  });

  test("projection does not choose arbitrarily between two compatible transactions", () => {
    const [projection] = buildInstallmentProjectionDrafts({
      accountId: "card-1",
      accountKind: "credit_card",
      description: "Loja PARC 01/05",
      amount: -100,
      postedAt: "2026-08-10T00:00:00.000Z",
      installmentNumber: 1,
      totalInstallments: 5,
      closingDay: 25,
      sourceType: "pdf_card_invoice",
    });

    const decision = chooseProjectionTransactionMatch(
      projection,
      [txn({ id: "a" }), txn({ id: "b" })],
      25,
    );

    assert.equal(decision.kind, "ambiguous");
  });

  test("commitment totals only count internal and unlinked detected or confirmed projections", () => {
    assert.equal(
      commitmentWithoutDoubleCount({
        internal: 100,
        detected: 40,
        confirmed: 50,
        linked: 100,
        reconciled: 100,
        divergent: 25,
        ignored: 999,
      }),
      190,
    );
  });

  test("description advances installment numbers preserving padding", () => {
    assert.equal(descriptionForInstallment("Loja PARC 01/05", 2, 5), "Loja PARC 02/05");
    assert.equal(descriptionForInstallment("Loja PARCELA 1 DE 5", 2, 5), "Loja PARCELA 2 DE 5");
  });

  test("migration creates persistent projections and card future RPC", () => {
    const sql = readFileSync(
      "supabase/migrations/20260906160651_credit_card_future_commitments.sql",
      "utf8",
    );

    assert.match(sql, /create table if not exists public\.installment_projections/);
    assert.match(sql, /unique \(organization_id, projection_fingerprint\)/);
    assert.match(sql, /create or replace function public\.card_future_commitments/);
    assert.match(sql, /linked_transaction_id is null/);
    assert.match(
      sql,
      /where ip\.status in \('detected', 'confirmed'\)\s+and ip\.linked_transaction_id is null/,
    );
    assert.doesNotMatch(
      sql,
      /where ip\.status in \('detected', 'confirmed', 'divergent'\)\s+and ip\.linked_transaction_id is null/,
    );
    assert.match(sql, /status = 'divergent'\) as total_divergent/);
    assert.match(sql, /status = 'divergent'\) as divergent_count/);
    assert.match(
      sql,
      /status in \('detected', 'confirmed', 'linked', 'reconciled', 'divergent', 'ignored'\)/,
    );
  });
});
