import { CreditCard, Landmark, TrendingUp, type LucideIcon } from "lucide-react";

export type AccountKind = "checking" | "credit_card" | "investment";

export type CategoryType = "income" | "expense" | "transfer";

export type CategoryRow = {
  id: string;
  name: string;
  type: CategoryType | string;
  parent_id?: string | null;
  color?: string | null;
  icon?: string | null;
  archived?: boolean | null;
};

export type AccountRow = {
  id: string;
  account_key: string;
  name: string;
  institution: string | null;
  kind: AccountKind;
  archived: boolean;
  initial_balance: number | null;
  initial_balance_date: string | null;
  closing_day: number | null;
  due_day: number | null;
  credit_limit: number | null;
  owner_user_id: string;
  is_primary: boolean;
};

export type AdditionalCardRow = {
  id: string;
  financial_account_id: string;
  member_user_id: string;
  label: string | null;
  archived: boolean;
};

export type AccountBalanceRow = {
  account_id: string;
  account_key: string;
  name: string;
  kind: AccountKind;
  initial_balance: number | null;
  initial_balance_date: string | null;
  current_balance: number;
};

export type CardSummaryRow = {
  account_id: string;
  account_key: string;
  name: string;
  credit_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  current_invoice_total: number;
  future_installments_total: number;
  limit_used: number;
  limit_available: number | null;
};

export type TxnRow = {
  id: string;
  description: string;
  amount: number;
  posted_at: string;
  type: string;
  account_id: string;
  account_kind: AccountKind | string;
  payment_method: string;
  entry_source: string;
  currency: string;
  category_id: string | null;
  created_by?: string | null;
  spent_by_member_id?: string | null;
  statement_import_id?: string | null;
  reconciled_statement_item_id?: string | null;
  installment_number: number | null;
  installment_plan_id: string | null;
  classification_method: string | null;
  classification_confidence: number | null;
  needs_review: boolean;
  original_text?: string | null;
  consolidation_status?: "aberto" | "consolidado" | string | null;
  period_closure_id?: string | null;
};

export type ExpenseSplitFilters = {
  categoryIds?: string[];
  accountIds?: string[];
  memberIds?: string[];
  description?: string;
  consolidationStatus?: string;
};

export type ExpenseSplitRow = {
  id: string;
  name: string | null;
  period_start: string;
  period_end: string;
  filters: ExpenseSplitFilters;
  split_mode: "percentage" | "weight";
  transaction_ids: string[];
  total_amount: number;
  created_by: string | null;
  created_at: string;
};

export type ExpenseSplitMemberRow = {
  id: string;
  split_id: string;
  member_user_id: string;
  share: number;
  should_pay_amount: number;
  paid_amount: number;
  balance_amount: number;
};

export type ExpenseSplitSettlementRow = {
  id: string;
  split_id: string;
  from_member_user_id: string;
  to_member_user_id: string;
  amount: number;
  status: "pending" | "paid";
  paid_at: string | null;
};

export type GoalType = "spending_limit" | "savings_result" | "investment" | "long_term";
export type GoalPeriod = "monthly" | "yearly" | "once";
export type GoalStatus = "active" | "paused" | "closed";

export type GoalRow = {
  id: string;
  goal_type: GoalType;
  name: string;
  description: string | null;
  status: GoalStatus;
  period_type: GoalPeriod;
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
  created_by: string | null;
  archived: boolean;
};

export type GoalMemberRow = {
  id: string;
  goal_id: string;
  member_user_id: string;
};

export type GoalProgressRow = {
  id: string;
  goal_id: string;
  recorded_at: string;
  amount: number;
  note: string | null;
};

export type GoalRealizedRow = {
  goal_id: string;
  period_start: string;
  period_end: string;
  realized_amount: number;
};

export const goalTypeLabel: Record<GoalType, string> = {
  spending_limit: "Limite de gastos",
  savings_result: "Sobra do período",
  investment: "Investimento",
  long_term: "Objetivo de longo prazo",
};

export const goalPeriodLabel: Record<GoalPeriod, string> = {
  monthly: "Mensal",
  yearly: "Anual",
  once: "Único (data-alvo)",
};

export const goalStatusLabel: Record<GoalStatus, string> = {
  active: "Em andamento",
  paused: "Pausada",
  closed: "Encerrada",
};

export type HouseholdMemberRow = {
  user_id: string;
  role: string;
  display_name: string | null;
  color: string | null;
};

export type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
};

export function memberDisplayName(profile: ProfileRow | null | undefined, userId: string): string {
  return profile?.display_name || profile?.email || `Membro ${userId.slice(0, 6)}`;
}

export const accountKindLabel: Record<string, string> = {
  checking: "Conta corrente",
  credit_card: "Cartão de crédito",
  investment: "Investimento",
};

export const categoryTypeLabel: Record<string, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

export const categoryTypeLabelPlural: Record<string, string> = {
  expense: "Despesas",
  income: "Receitas",
  transfer: "Transferências",
};

const ACCOUNT_KIND_ICON: Record<string, LucideIcon> = {
  checking: Landmark,
  credit_card: CreditCard,
  investment: TrendingUp,
};

export function accountKindIcon(kind: string): LucideIcon {
  return ACCOUNT_KIND_ICON[kind] ?? Landmark;
}

export function formatCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function accountLabel(accountId: string, accountKind: string, name?: string | null): string {
  if (name) return name;
  const kind = accountKindLabel[accountKind] ?? accountKind;
  const suffix = accountId.length > 4 ? `•••${accountId.slice(-4)}` : accountId;
  return `${kind} ${suffix}`;
}
