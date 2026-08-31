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

  test("persistent reconciliation foundation survives import deletion", () => {
    const sql = readFileSync(
      "supabase/migrations/20260831205041_persistent_reconciliation_foundation.sql",
      "utf8",
    );

    assert.match(sql, /create table if not exists public\.reconciliation_periods/);
    assert.match(sql, /create table if not exists public\.external_statement_items/);
    assert.match(sql, /create table if not exists public\.reconciliation_links/);
    assert.match(
      sql,
      /statement_import_id uuid references public\.statement_imports\(id\) on delete set null/,
    );
    assert.match(sql, /unique \(organization_id, source_fingerprint\)/);
    assert.match(sql, /unique \(organization_id, external_statement_item_id\)/);
  });

  test("persistent reconciliation backfill creates period, external item and link", () => {
    const sql = readFileSync(
      "supabase/migrations/20260831210708_persistent_reconciliation_backfill.sql",
      "utf8",
    );

    assert.match(sql, /insert into public\.reconciliation_periods/);
    assert.match(sql, /insert into public\.external_statement_items/);
    assert.match(sql, /insert into public\.reconciliation_links/);
    assert.match(sql, /from public\.statement_items si/);
    assert.match(sql, /join public\.statement_imports imp/);
    assert.match(sql, /join public\.transactions t/);
    assert.match(sql, /matched_transaction_id/);
    assert.match(sql, /installment_number/);
    assert.match(sql, /statement_import_id/);
  });

  test("persistent reconciliation backfill diagnoses ambiguity instead of choosing arbitrarily", () => {
    const sql = readFileSync(
      "supabase/migrations/20260831210708_persistent_reconciliation_backfill.sql",
      "utf8",
    );

    assert.match(sql, /reconciliation_backfill_diagnostics/);
    assert.match(sql, /ambiguous_legacy_transaction_link/);
    assert.match(sql, /duplicate_external_source_fingerprint/);
    assert.match(sql, /coalesce\(lr\.transaction_count, 0\) <= 1/);
  });

  test("persistent reconciliation backfill does not mutate financial rows", () => {
    const sql = readFileSync(
      "supabase/migrations/20260831210708_persistent_reconciliation_backfill.sql",
      "utf8",
    );

    assert.doesNotMatch(sql, /update\s+public\.transactions/i);
    assert.doesNotMatch(sql, /delete\s+from\s+public\.transactions/i);
    assert.doesNotMatch(sql, /delete\s+from\s+public\.statement_items/i);
  });

  test("recordPersistentReconciliationLink creates or fails when the external item is missing", () => {
    const sql = readFileSync("src/lib/reconciliation/data.ts", "utf8");
    const start = sql.indexOf("export async function recordPersistentReconciliationLink");
    const implementation = sql.slice(start);

    assert.doesNotMatch(implementation, /if \(!externalItemId\) return/);
    assert.match(implementation, /upsertExternalStatementItems/);
    assert.match(implementation, /Não foi possível gravar a conciliação persistente/);
  });

  test("legacy reconciliation status is written after the persistent link", () => {
    const sql = readFileSync("src/routes/conciliacao.tsx", "utf8");
    const matchStart = sql.indexOf('if (action.type === "match")');
    const acceptStart = sql.indexOf('if (action.type === "accept")');
    const matchBlock = sql.slice(matchStart, acceptStart);
    const finalAcceptStart = sql.indexOf("if (!persistentLinkRecorded)", acceptStart);
    const finalAcceptEnd = sql.indexOf("if (", finalAcceptStart + 1);
    const finalAcceptBlock = sql.slice(finalAcceptStart, finalAcceptEnd);

    assert.ok(
      matchBlock.indexOf("await recordPersistentReconciliationLink") <
        matchBlock.indexOf('status: "matched"'),
      "manual match should persist the link before marking the legacy item as matched",
    );
    assert.ok(
      finalAcceptBlock.indexOf("await recordPersistentReconciliationLink") <
        finalAcceptBlock.indexOf('status: "accepted"'),
      "accept should persist the link before marking the legacy item as accepted",
    );
  });
});
