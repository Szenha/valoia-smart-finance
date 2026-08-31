import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  buildReconciliationFingerprint,
  buildSourceFingerprint,
  legacyStatusFromLinkStatus,
  periodFromLines,
  sourceTypeForImport,
} from "./persistent";

describe("persistent reconciliation helpers", () => {
  test("derives an account statement period for imported OFX rows", () => {
    const period = periodFromLines(
      [
        {
          postedAt: "2026-07-03T00:00:00.000Z",
          accountId: "checking-1",
          accountKind: "checking",
        },
        {
          postedAt: "2026-07-15T00:00:00.000Z",
          accountId: "checking-1",
          accountKind: "checking",
        },
      ],
      "account_statement",
    );

    assert.equal(period.scopeType, "account_statement");
    assert.equal(period.accountId, "checking-1");
    assert.equal(period.periodStart, "2026-07-03");
    assert.equal(period.periodEnd, "2026-07-15");
    assert.equal(period.competencePeriod, "2026-07-01");
  });

  test("derives a card invoice period for imported PDF rows", () => {
    const period = periodFromLines(
      [
        {
          postedAt: "2026-08-10T00:00:00.000Z",
          accountId: "card-1",
          accountKind: "credit_card",
        },
      ],
      "card_invoice",
    );

    assert.equal(sourceTypeForImport("pdf", "credit_card"), "pdf_card_invoice");
    assert.equal(period.scopeType, "card_invoice");
    assert.equal(period.accountKind, "credit_card");
    assert.equal(period.competencePeriod, "2026-08-01");
  });

  test("keeps source fingerprints stable for the same visible financial line", () => {
    const line = {
      sourceType: "pdf_card_invoice" as const,
      accountId: "card-1",
      accountKind: "credit_card",
      postedAt: "2026-08-10T00:00:00.000Z",
      amount: -100,
      description: "Loja Parc 02/05",
      fitId: "PDF-abc",
      lineHash: "abc",
      installmentNumber: 2,
      totalInstallments: 5,
    };

    assert.equal(buildSourceFingerprint(line), buildSourceFingerprint({ ...line }));
  });

  test("reconciliation fingerprint ignores source type for overlapping files", () => {
    const base = {
      accountId: "card-1",
      accountKind: "credit_card",
      postedAt: "2026-08-10T00:00:00.000Z",
      amount: -100,
      description: "Loja Parc 02/05",
      installmentNumber: 2,
      totalInstallments: 5,
    };

    assert.equal(
      buildReconciliationFingerprint({ ...base, sourceType: "pdf_card_invoice" }),
      buildReconciliationFingerprint({ ...base, sourceType: "ofx_credit_card" }),
    );
  });

  test("line previously reconciled is restored as reconciled in the legacy board", () => {
    assert.equal(legacyStatusFromLinkStatus("pending", "matched", "pending"), "matched");
    assert.equal(legacyStatusFromLinkStatus("pending", "accepted_new", "pending"), "accepted");
    assert.equal(legacyStatusFromLinkStatus("pending", "review", "pending"), "review");
    assert.equal(legacyStatusFromLinkStatus("pending", null, "ignored"), "ignored");
  });
});
