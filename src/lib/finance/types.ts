import { CreditCard, Landmark, TrendingUp, type LucideIcon } from "lucide-react";

export type AccountKind = "checking" | "credit_card" | "investment";

export type CategoryRow = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer" | string;
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
};

export type AccountBalanceRow = {
  account_id: string;
  account_key: string;
  name: string;
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

export type HouseholdMemberRow = {
  user_id: string;
  role: string;
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
