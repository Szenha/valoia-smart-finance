import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

describe("reconciliation migration", () => {
  test("diagnoses duplicate installments before adding the plan/number constraint", () => {
    const sql = readFileSync(
      "supabase/migrations/20260831140738_reconciliation_dedup_and_installments.sql",
      "utf8",
    );
    const diagnosticIndex = sql.indexOf("Duplicatas existentes impedem a constraint");
    const constraintIndex = sql.indexOf(
      "add constraint transactions_org_installment_plan_number_key",
    );

    assert.ok(diagnosticIndex >= 0, "migration must raise a clear duplicate diagnostic");
    assert.ok(
      constraintIndex > diagnosticIndex,
      "diagnostic must run before adding the constraint",
    );
  });
});
