import type { AccountKind } from "@/lib/finance/types";

export type StatementImportRow = {
  id: string;
  filename: string;
  account_id: string;
  account_kind: AccountKind | string;
  content_hash: string | null;
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

export type StatementItemStatus = "pending" | "matched" | "accepted" | "review" | "ignored";

export type ReconciliationPeriodRow = {
  id: string;
  organization_id: string;
  scope_type: "account_statement" | "card_invoice";
  account_id: string;
  account_kind: AccountKind | string;
  period_start: string;
  period_end: string;
  competence_period: string;
  status: "open" | "ready_to_close" | "closed" | "reopened";
  expected_total: number | null;
  system_total: number | null;
  difference: number | null;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
};

export type ExternalStatementItemRow = {
  id: string;
  organization_id: string;
  reconciliation_period_id: string;
  statement_import_id: string | null;
  source_type: "ofx_checking" | "ofx_credit_card" | "pdf_card_invoice";
  source_fingerprint: string;
  reconciliation_fingerprint: string;
  raw_description: string;
  normalized_description: string;
  amount: number;
  posted_at: string;
  account_id: string;
  account_kind: AccountKind | string;
  fit_id: string | null;
  line_hash: string | null;
  installment_number: number | null;
  total_installments: number | null;
  status: StatementItemStatus;
};

export type ReconciliationLinkRow = {
  id: string;
  organization_id: string;
  external_statement_item_id: string;
  transaction_id: string | null;
  status: "matched" | "accepted_new" | "edited_existing" | "ignored" | "review";
  confidence: number | null;
  match_reason: string | null;
  matched_by: string | null;
  matched_at: string | null;
};

export type InstallmentProjectionStatus =
  | "detected"
  | "confirmed"
  | "linked"
  | "reconciled"
  | "divergent"
  | "ignored";

export type InstallmentProjectionRow = {
  id: string;
  organization_id: string;
  account_id: string;
  account_kind: AccountKind | string;
  source_external_item_id: string | null;
  reconciliation_period_id: string | null;
  installment_plan_id: string | null;
  linked_transaction_id: string | null;
  description: string;
  normalized_description: string;
  installment_number: number;
  total_installments: number;
  expected_amount: number;
  expected_posted_at: string;
  expected_competence_month: string;
  status: InstallmentProjectionStatus;
  source_type: "pdf_card_invoice" | "ofx_credit_card" | "manual_projection";
  projection_fingerprint: string;
};

export type StatementItemRow = {
  id: string;
  statement_import_id: string;
  matched_transaction_id: string | null;
  line_hash: string | null;
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
  installment_number: number | null;
  total_installments: number | null;
};

export type MatchSuggestion = {
  itemId: string;
  transactionId: string | null;
  confidence: number;
  reason: string;
};
