import { supabase } from "@/lib/supabase/client";
import type { TxnRow } from "@/lib/finance/types";
import type { StatementImportRow, StatementItemRow } from "./types";

export async function fetchStatementImports(orgId: string): Promise<StatementImportRow[]> {
  const { data, error } = await supabase
    .from("statement_imports")
    .select(
      "id, filename, account_id, account_kind, content_hash, source, transaction_count, status, created_at",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as StatementImportRow[];
}

export async function fetchStatementImportByContentHash(
  orgId: string,
  contentHash: string,
): Promise<StatementImportRow | null> {
  const { data, error } = await supabase
    .from("statement_imports")
    .select(
      "id, filename, account_id, account_kind, content_hash, source, transaction_count, status, created_at",
    )
    .eq("organization_id", orgId)
    .eq("content_hash", contentHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as StatementImportRow | null;
}

export async function fetchStatementItems(
  orgId: string,
  statementImportId: string,
): Promise<StatementItemRow[]> {
  const { data, error } = await supabase
    .from("statement_items")
    .select(
      "id, statement_import_id, matched_transaction_id, line_hash, amount, description, posted_at, fit_id, type, account_id, account_kind, currency, status, match_confidence, extraction_confidence, extraction_source_excerpt, installment_number, total_installments",
    )
    .eq("organization_id", orgId)
    .eq("statement_import_id", statementImportId)
    .order("posted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StatementItemRow[];
}

export async function deleteStatementImport(orgId: string, importId: string): Promise<void> {
  const { data: items, error: itemErr } = await supabase
    .from("statement_items")
    .select("id")
    .eq("organization_id", orgId)
    .eq("statement_import_id", importId);
  if (itemErr) throw new Error(itemErr.message);

  const itemIds = (items ?? []).map((item) => item.id as string);
  if (itemIds.length > 0) {
    const { error: unlinkErr } = await supabase
      .from("transactions")
      .update({ statement_import_id: null, reconciled_statement_item_id: null })
      .eq("organization_id", orgId)
      .in("reconciled_statement_item_id", itemIds)
      .not("entry_source", "in", "(ofx_import,pdf_import)");
    if (unlinkErr) throw new Error(unlinkErr.message);
  }

  const { error: txErr } = await supabase
    .from("transactions")
    .delete()
    .eq("organization_id", orgId)
    .eq("statement_import_id", importId)
    .in("entry_source", ["ofx_import", "pdf_import"]);
  if (txErr) throw new Error(txErr.message);

  const { error: impErr } = await supabase
    .from("statement_imports")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", importId);
  if (impErr) throw new Error(impErr.message);
}

export async function fetchManualTransactionsForPeriod(
  orgId: string,
  items: StatementItemRow[],
): Promise<TxnRow[]> {
  if (items.length === 0) return [];
  const times = items.map((item) => new Date(item.posted_at).getTime());
  const start = new Date(Math.min(...times) - 3 * 86_400_000).toISOString();
  const end = new Date(Math.max(...times) + 3 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, statement_import_id, reconciled_statement_item_id, recurring_bill_occurrence_id, consolidation_status, period_closure_id",
    )
    .eq("organization_id", orgId)
    .gte("posted_at", start)
    .lte("posted_at", end)
    .order("posted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TxnRow[];
}
