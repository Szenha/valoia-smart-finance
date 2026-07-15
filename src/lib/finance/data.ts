import { supabase } from "@/lib/supabase/client";
import type {
  AccountBalanceRow,
  AccountRow,
  CardSummaryRow,
  CategoryRow,
  HouseholdMemberRow,
  ProfileRow,
  TxnRow,
} from "./types";

export async function fetchTransactions(orgId: string): Promise<TxnRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, statement_import_id, reconciled_statement_item_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id",
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
    .select("id, name, type, parent_id, color, icon")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
}

export async function fetchAccounts(orgId: string): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select(
      "id, account_key, name, institution, kind, archived, initial_balance, initial_balance_date, closing_day, due_day, credit_limit, owner_user_id",
    )
    .eq("organization_id", orgId)
    .order("archived")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountRow[];
}

export async function fetchAccountBalances(orgId: string): Promise<AccountBalanceRow[]> {
  const { data, error } = await supabase.rpc("account_balances", { p_org_id: orgId });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountBalanceRow[];
}

export async function fetchCardSummary(orgId: string): Promise<CardSummaryRow[]> {
  const { data, error } = await supabase.rpc("card_summary", { p_org_id: orgId });
  if (error) throw new Error(error.message);
  return (data ?? []) as CardSummaryRow[];
}

export async function fetchHouseholdMembers(orgId: string): Promise<HouseholdMemberRow[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role, display_name, color")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HouseholdMemberRow[];
}

export async function fetchOrganizationOwner(orgId: string): Promise<string> {
  const { data, error } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .single();
  if (error) throw new Error(error.message);
  return data.owner_id as string;
}

export async function removeHouseholdMember(orgId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function ensureAccountFromTransaction(
  orgId: string,
  accountId: string,
  accountKind: string,
  ownerUserId?: string,
): Promise<void> {
  await supabase.from("financial_accounts").upsert(
    {
      organization_id: orgId,
      account_key: accountId,
      name: accountId,
      kind: accountKind,
      ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
    },
    { onConflict: "organization_id,account_key" },
  );
}

export async function fetchMemberProfiles(userIds: string[]): Promise<ProfileRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in("id", userIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileRow[];
}

export async function findHouseholdCandidate(
  orgId: string,
  email: string,
): Promise<{ user_id: string; display_name: string | null } | null> {
  const { data, error } = await supabase.rpc("find_household_candidate", {
    p_org_id: orgId,
    p_email: email,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { user_id: string; display_name: string | null }[];
  return rows[0] ?? null;
}

export async function addHouseholdMember(
  orgId: string,
  userId: string,
  role: string,
  invitedBy: string | null,
  displayName: string | null,
  color: string | null,
): Promise<void> {
  const { error } = await supabase.from("organization_members").insert({
    organization_id: orgId,
    user_id: userId,
    role,
    invited_by: invitedBy,
    display_name: displayName,
    color,
  });
  if (error) throw new Error(error.message);
}

export async function updateHouseholdMember(
  orgId: string,
  userId: string,
  fields: { role: string; displayName: string | null; color: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .update({ role: fields.role, display_name: fields.displayName, color: fields.color })
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function countAccountTransactions(orgId: string, accountKey: string): Promise<number> {
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("account_id", accountKey);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteAccount(orgId: string, accountId: string): Promise<void> {
  const { error } = await supabase
    .from("financial_accounts")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", accountId);
  if (error) throw new Error(error.message);
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
