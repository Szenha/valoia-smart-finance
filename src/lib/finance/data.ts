import { supabase } from "@/lib/supabase/client";
import type { AccountRow, CategoryRow, TxnRow } from "./types";

export async function fetchTransactions(orgId: string): Promise<TxnRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, description, amount, posted_at, type, account_id, account_kind, currency, category_id, created_by, statement_import_id, reconciled_statement_item_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id",
    )
    .eq("organization_id", orgId)
    .order("posted_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as TxnRow[];
}

export async function fetchCategories(orgId: string): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, color, icon")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
}

export async function fetchAccounts(orgId: string): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id, account_key, name, institution, kind, archived")
    .eq("organization_id", orgId)
    .order("archived")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountRow[];
}

export async function ensureAccountFromTransaction(
  orgId: string,
  accountId: string,
  accountKind: string,
): Promise<void> {
  await supabase.from("financial_accounts").upsert(
    {
      organization_id: orgId,
      account_key: accountId,
      name: accountId,
      kind: accountKind,
    },
    { onConflict: "organization_id,account_key" },
  );
}

export function accountOptionsFromTransactions(transactions: TxnRow[]) {
  return Array.from(
    new Map(
      transactions.map((t) => [
        `${t.account_id}|${t.account_kind}`,
        { accountId: t.account_id, accountKind: String(t.account_kind) },
      ]),
    ).values(),
  );
}
