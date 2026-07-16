import { supabase } from "@/lib/supabase/client";
import type {
  AccountBalanceRow,
  AccountRow,
  AdditionalCardRow,
  CardSummaryRow,
  CategoryRow,
  ExpenseSplitFilters,
  ExpenseSplitMemberRow,
  ExpenseSplitRow,
  ExpenseSplitSettlementRow,
  GoalMemberRow,
  GoalProgressRow,
  GoalRealizedRow,
  GoalRow,
  HouseholdMemberRow,
  ProfileRow,
  TxnRow,
} from "./types";

export async function fetchTransactions(orgId: string): Promise<TxnRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, spent_by_member_id, statement_import_id, reconciled_statement_item_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id",
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

export async function fetchAdditionalCards(orgId: string): Promise<AdditionalCardRow[]> {
  const { data, error } = await supabase
    .from("card_additional_holders")
    .select("id, financial_account_id, member_user_id, label, archived")
    .eq("organization_id", orgId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdditionalCardRow[];
}

export async function addAdditionalCard(
  orgId: string,
  financialAccountId: string,
  memberUserId: string,
  label: string | null,
): Promise<void> {
  const { error } = await supabase.from("card_additional_holders").insert({
    organization_id: orgId,
    financial_account_id: financialAccountId,
    member_user_id: memberUserId,
    label,
  });
  if (error) throw new Error(error.message);
}

export async function removeAdditionalCard(orgId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("card_additional_holders")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", id);
  if (error) throw new Error(error.message);
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

export async function fetchGoals(orgId: string): Promise<GoalRow[]> {
  const { data, error } = await supabase
    .from("financial_goals")
    .select(
      "id, goal_type, name, description, status, period_type, target_amount, initial_amount, current_amount, monthly_contribution, estimated_return_rate, start_date, end_date, account_id, category_id, auto_tracked, created_by, archived",
    )
    .eq("organization_id", orgId)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoalRow[];
}

// Sem filtro de organização explícito: a policy "goal_members_select" já
// restringe às metas de organizações das quais o usuário é membro, e cada
// usuário normalmente pertence a uma única família/organização.
export async function fetchGoalMembers(): Promise<GoalMemberRow[]> {
  const { data, error } = await supabase.from("goal_members").select("id, goal_id, member_user_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as GoalMemberRow[];
}

export async function fetchGoalProgress(goalId: string): Promise<GoalProgressRow[]> {
  const { data, error } = await supabase
    .from("goal_progress")
    .select("id, goal_id, recorded_at, amount, note")
    .eq("goal_id", goalId)
    .order("recorded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoalProgressRow[];
}

// Todas as metas da organização de uma vez (RLS restringe pela mesma regra
// de fetchGoalMembers) — usado pela listagem para achar o registro mais
// recente por meta sem uma query por card.
export async function fetchAllGoalProgress(): Promise<GoalProgressRow[]> {
  const { data, error } = await supabase
    .from("goal_progress")
    .select("id, goal_id, recorded_at, amount, note")
    .order("recorded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoalProgressRow[];
}

export async function fetchGoalsRealized(
  orgId: string,
  referenceDate: string,
): Promise<GoalRealizedRow[]> {
  const { data, error } = await supabase.rpc("goals_realized", {
    p_org_id: orgId,
    p_reference_date: referenceDate,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoalRealizedRow[];
}

export type GoalInput = {
  goal_type: GoalRow["goal_type"];
  name: string;
  description: string | null;
  period_type: GoalRow["period_type"];
  target_amount: number;
  initial_amount: number | null;
  current_amount: number | null;
  monthly_contribution: number | null;
  estimated_return_rate: number | null;
  start_date: string;
  end_date: string | null;
  account_id: string | null;
  category_id: string | null;
  auto_tracked: boolean;
};

export async function createGoal(
  orgId: string,
  createdBy: string | null,
  input: GoalInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("financial_goals")
    .insert({ organization_id: orgId, created_by: createdBy, ...input })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateGoal(goalId: string, input: GoalInput): Promise<void> {
  const { error } = await supabase
    .from("financial_goals")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) throw new Error(error.message);
}

export async function setGoalStatus(goalId: string, status: GoalRow["status"]): Promise<void> {
  const { error } = await supabase
    .from("financial_goals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) throw new Error(error.message);
}

export async function archiveGoal(goalId: string): Promise<void> {
  const { error } = await supabase
    .from("financial_goals")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) throw new Error(error.message);
}

/** Substitui a lista inteira de membros vinculados a uma meta — vazio =
 *  compartilhada com toda a família. */
export async function setGoalMembers(goalId: string, memberUserIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from("goal_members").delete().eq("goal_id", goalId);
  if (deleteError) throw new Error(deleteError.message);
  if (memberUserIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("goal_members")
    .insert(
      memberUserIds.map((memberUserId) => ({ goal_id: goalId, member_user_id: memberUserId })),
    );
  if (insertError) throw new Error(insertError.message);
}

export async function addGoalProgress(
  goalId: string,
  createdBy: string | null,
  amount: number,
  recordedAt: string,
  note: string | null,
): Promise<void> {
  const { error } = await supabase.from("goal_progress").insert({
    goal_id: goalId,
    created_by: createdBy,
    amount,
    recorded_at: recordedAt,
    note,
  });
  if (error) throw new Error(error.message);
}

export async function fetchExpenseSplits(orgId: string): Promise<ExpenseSplitRow[]> {
  const { data, error } = await supabase
    .from("expense_splits")
    .select(
      "id, name, period_start, period_end, filters, split_mode, transaction_ids, total_amount, created_by, created_at",
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpenseSplitRow[];
}

export async function fetchExpenseSplitMembers(splitId: string): Promise<ExpenseSplitMemberRow[]> {
  const { data, error } = await supabase
    .from("expense_split_members")
    .select("id, split_id, member_user_id, share, should_pay_amount, paid_amount, balance_amount")
    .eq("split_id", splitId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpenseSplitMemberRow[];
}

export async function fetchExpenseSplitSettlements(
  splitId: string,
): Promise<ExpenseSplitSettlementRow[]> {
  const { data, error } = await supabase
    .from("expense_split_settlements")
    .select("id, split_id, from_member_user_id, to_member_user_id, amount, status, paid_at")
    .eq("split_id", splitId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpenseSplitSettlementRow[];
}

export type SaveExpenseSplitInput = {
  name: string | null;
  periodStart: string;
  periodEnd: string;
  filters: ExpenseSplitFilters;
  splitMode: "percentage" | "weight";
  transactionIds: string[];
  totalAmount: number;
  members: {
    memberUserId: string;
    share: number;
    shouldPayAmount: number;
    paidAmount: number;
    balanceAmount: number;
  }[];
  settlements: { fromMemberUserId: string; toMemberUserId: string; amount: number }[];
};

export async function saveExpenseSplit(
  orgId: string,
  createdBy: string | null,
  input: SaveExpenseSplitInput,
): Promise<string> {
  const { data: split, error: splitError } = await supabase
    .from("expense_splits")
    .insert({
      organization_id: orgId,
      name: input.name,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      filters: input.filters,
      split_mode: input.splitMode,
      transaction_ids: input.transactionIds,
      total_amount: input.totalAmount,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (splitError) throw new Error(splitError.message);
  const splitId = split.id as string;

  if (input.members.length > 0) {
    const { error: membersError } = await supabase.from("expense_split_members").insert(
      input.members.map((member) => ({
        split_id: splitId,
        member_user_id: member.memberUserId,
        share: member.share,
        should_pay_amount: member.shouldPayAmount,
        paid_amount: member.paidAmount,
        balance_amount: member.balanceAmount,
      })),
    );
    if (membersError) throw new Error(membersError.message);
  }

  if (input.settlements.length > 0) {
    const { error: settlementsError } = await supabase.from("expense_split_settlements").insert(
      input.settlements.map((settlement) => ({
        split_id: splitId,
        from_member_user_id: settlement.fromMemberUserId,
        to_member_user_id: settlement.toMemberUserId,
        amount: settlement.amount,
      })),
    );
    if (settlementsError) throw new Error(settlementsError.message);
  }

  return splitId;
}

export async function updateSettlementStatus(
  settlementId: string,
  status: "pending" | "paid",
): Promise<void> {
  const { error } = await supabase
    .from("expense_split_settlements")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
    .eq("id", settlementId);
  if (error) throw new Error(error.message);
}

export async function deleteExpenseSplit(splitId: string): Promise<void> {
  const { error } = await supabase.from("expense_splits").delete().eq("id", splitId);
  if (error) throw new Error(error.message);
}
