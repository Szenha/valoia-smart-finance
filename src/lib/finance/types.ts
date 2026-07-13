export type AccountKind = "checking" | "credit_card" | "investment";

export type CategoryRow = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer" | string;
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
};

export type TxnRow = {
  id: string;
  description: string;
  amount: number;
  posted_at: string;
  type: string;
  account_id: string;
  account_kind: AccountKind | string;
  currency: string;
  category_id: string | null;
  installment_number: number | null;
  installment_plan_id: string | null;
  classification_method: string | null;
  classification_confidence: number | null;
  needs_review: boolean;
  original_text?: string | null;
};

export const accountKindLabel: Record<string, string> = {
  checking: "Conta corrente",
  credit_card: "Cartão de crédito",
  investment: "Investimento",
};

export function formatCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function accountLabel(accountId: string, accountKind: string, name?: string | null): string {
  if (name) return name;
  const kind = accountKindLabel[accountKind] ?? accountKind;
  const suffix = accountId.length > 4 ? `•••${accountId.slice(-4)}` : accountId;
  return `${kind} ${suffix}`;
}
