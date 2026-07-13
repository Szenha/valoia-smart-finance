import type { AccountKind } from "@/lib/finance/types";

export type StatementImportRow = {
  id: string;
  filename: string;
  account_id: string;
  account_kind: AccountKind | string;
  source: string | null;
  transaction_count: number;
  status: string;
  created_at: string;
};

export type PeriodClosureRow = {
  id: string;
  scope_type: "card_invoice" | "account_month";
  account_id: string;
  account_kind: AccountKind | string;
  competence_period: string;
  status: "aberto" | "fechado";
  closed_by: string | null;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
};

export type StatementItemStatus = "pending" | "matched" | "accepted" | "review";

export type StatementItemRow = {
  id: string;
  statement_import_id: string;
  matched_transaction_id: string | null;
  amount: number;
  description: string;
  posted_at: string;
  fit_id: string | null;
  type: string;
  account_id: string;
  account_kind: AccountKind | string;
  currency: string;
  status: StatementItemStatus;
  match_confidence: number | null;
  extraction_confidence: number | null;
  extraction_source_excerpt: string | null;
};

export type MatchSuggestion = {
  itemId: string;
  transactionId: string | null;
  confidence: number;
  reason: string;
};
