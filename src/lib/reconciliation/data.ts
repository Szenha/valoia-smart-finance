import { supabase } from "@/lib/supabase/client";
import type { TxnRow } from "@/lib/finance/types";
import { addMonthsToDateOnly, competenceMonthDateOnly } from "@/lib/finance/date-utils";
import { normalizeStatementDescription } from "./dedup";
import type {
  ExternalStatementItemRow,
  InstallmentProjectionRow,
  ReconciliationLinkRow,
  ReconciliationPeriodRow,
  StatementImportRow,
  StatementItemRow,
  StatementItemStatus,
} from "./types";
import type { InstallmentProjectionDraft } from "./installment-projections";
import {
  buildProjectionFingerprint,
  chooseProjectionTransactionMatch,
} from "./installment-projections";
import type {
  ExternalSourceType,
  PersistentPeriodInput,
  ReconciliationLinkStatus,
} from "./persistent";
import {
  buildReconciliationFingerprint,
  buildSourceFingerprint,
  periodFromLines,
  sourceTypeForImport,
} from "./persistent";

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
  const { error: externalUnlinkErr } = await supabase
    .from("external_statement_items")
    .update({ statement_import_id: null })
    .eq("organization_id", orgId)
    .eq("statement_import_id", importId);
  if (externalUnlinkErr) throw new Error(externalUnlinkErr.message);

  if (itemIds.length > 0) {
    const { error: unlinkErr } = await supabase
      .from("transactions")
      .update({ statement_import_id: null, reconciled_statement_item_id: null })
      .eq("organization_id", orgId)
      .in("reconciled_statement_item_id", itemIds)
      .not("entry_source", "in", "(ofx_import,pdf_import)");
    if (unlinkErr) throw new Error(unlinkErr.message);
  }

  const { error: txUnlinkErr } = await supabase
    .from("transactions")
    .update({ statement_import_id: null, reconciled_statement_item_id: null })
    .eq("organization_id", orgId)
    .eq("statement_import_id", importId);
  if (txUnlinkErr) throw new Error(txUnlinkErr.message);

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

export async function fetchActiveReconciliationLinkTransactionIds(
  orgId: string,
  transactionIds: string[],
): Promise<string[]> {
  const ids = Array.from(new Set(transactionIds)).filter(Boolean);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("reconciliation_links")
    .select("transaction_id")
    .eq("organization_id", orgId)
    .in("transaction_id", ids)
    .in("status", ["matched", "accepted_new", "edited_existing"]);
  if (error) throw new Error(error.message);
  return Array.from(
    new Set((data ?? []).map((row) => row.transaction_id as string | null).filter(Boolean)),
  ) as string[];
}

export type ExternalStatementItemDraft = {
  source_type: ExternalSourceType;
  source_fingerprint: string;
  reconciliation_fingerprint: string;
  raw_description: string;
  amount: number;
  posted_at: string;
  account_id: string;
  account_kind: string;
  fit_id: string | null;
  line_hash: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
  status?: StatementItemStatus;
};

export type PersistedExternalStatementItem = ExternalStatementItemRow & {
  link_transaction_id: string | null;
  link_status: ReconciliationLinkRow["status"] | null;
};

function externalStatusFromLinkStatus(status: ReconciliationLinkStatus): StatementItemStatus {
  if (status === "accepted_new") return "accepted";
  if (status === "edited_existing") return "matched";
  return status;
}

export async function upsertReconciliationPeriod(
  orgId: string,
  input: PersistentPeriodInput,
  totals: { expectedTotal?: number | null; systemTotal?: number | null } = {},
): Promise<ReconciliationPeriodRow> {
  const expectedTotal = totals.expectedTotal ?? null;
  const systemTotal = totals.systemTotal ?? null;
  const { data, error } = await supabase
    .from("reconciliation_periods")
    .upsert(
      {
        organization_id: orgId,
        scope_type: input.scopeType,
        account_id: input.accountId,
        account_kind: input.accountKind,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        competence_period: input.competencePeriod,
        expected_total: expectedTotal,
        system_total: systemTotal,
        difference:
          expectedTotal === null || systemTotal === null ? null : expectedTotal - systemTotal,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,scope_type,account_id,account_kind,period_start,period_end",
      },
    )
    .select(
      "id, organization_id, scope_type, account_id, account_kind, period_start, period_end, competence_period, status, expected_total, system_total, difference, closed_at, closed_by, reopened_at, reopened_by",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as ReconciliationPeriodRow;
}

async function fetchExternalItemsBySourceFingerprints(
  orgId: string,
  fingerprints: string[],
): Promise<ExternalStatementItemRow[]> {
  const values = Array.from(new Set(fingerprints)).filter(Boolean);
  if (values.length === 0) return [];
  const { data, error } = await supabase
    .from("external_statement_items")
    .select(
      "id, organization_id, reconciliation_period_id, statement_import_id, source_type, source_fingerprint, reconciliation_fingerprint, raw_description, normalized_description, amount, posted_at, account_id, account_kind, fit_id, line_hash, installment_number, total_installments, status",
    )
    .eq("organization_id", orgId)
    .in("source_fingerprint", values);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExternalStatementItemRow[];
}

async function fetchExternalItemsByReconciliationFingerprints(
  orgId: string,
  fingerprints: string[],
): Promise<ExternalStatementItemRow[]> {
  const values = Array.from(new Set(fingerprints)).filter(Boolean);
  if (values.length === 0) return [];
  const { data, error } = await supabase
    .from("external_statement_items")
    .select(
      "id, organization_id, reconciliation_period_id, statement_import_id, source_type, source_fingerprint, reconciliation_fingerprint, raw_description, normalized_description, amount, posted_at, account_id, account_kind, fit_id, line_hash, installment_number, total_installments, status",
    )
    .eq("organization_id", orgId)
    .in("reconciliation_fingerprint", values);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExternalStatementItemRow[];
}

async function fetchLinksForExternalItems(
  orgId: string,
  externalItemIds: string[],
): Promise<ReconciliationLinkRow[]> {
  const ids = Array.from(new Set(externalItemIds)).filter(Boolean);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("reconciliation_links")
    .select(
      "id, organization_id, external_statement_item_id, transaction_id, status, confidence, match_reason, matched_by, matched_at",
    )
    .eq("organization_id", orgId)
    .in("external_statement_item_id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReconciliationLinkRow[];
}

export async function upsertExternalStatementItems(
  orgId: string,
  reconciliationPeriodId: string,
  statementImportId: string,
  drafts: ExternalStatementItemDraft[],
): Promise<PersistedExternalStatementItem[]> {
  const bySource = new Map(
    (
      await fetchExternalItemsBySourceFingerprints(
        orgId,
        drafts.map((draft) => draft.source_fingerprint),
      )
    ).map((item) => [item.source_fingerprint, item]),
  );
  const sourceMisses = drafts.filter((draft) => !bySource.has(draft.source_fingerprint));
  const draftReconciliationCounts = new Map<string, number>();
  for (const draft of sourceMisses) {
    draftReconciliationCounts.set(
      draft.reconciliation_fingerprint,
      (draftReconciliationCounts.get(draft.reconciliation_fingerprint) ?? 0) + 1,
    );
  }
  const reconciliationMatches = await fetchExternalItemsByReconciliationFingerprints(
    orgId,
    sourceMisses.map((draft) => draft.reconciliation_fingerprint),
  );
  const byReconciliation = new Map<string, ExternalStatementItemRow>();
  const reconciliationCounts = new Map<string, number>();
  for (const item of reconciliationMatches) {
    reconciliationCounts.set(
      item.reconciliation_fingerprint,
      (reconciliationCounts.get(item.reconciliation_fingerprint) ?? 0) + 1,
    );
    byReconciliation.set(item.reconciliation_fingerprint, item);
  }

  const existingByDraft = new Map<string, ExternalStatementItemRow>();
  for (const draft of drafts) {
    const sourceMatch = bySource.get(draft.source_fingerprint);
    if (sourceMatch) {
      existingByDraft.set(draft.source_fingerprint, sourceMatch);
      continue;
    }
    const reconciliationMatch = byReconciliation.get(draft.reconciliation_fingerprint);
    if (
      reconciliationMatch &&
      reconciliationCounts.get(draft.reconciliation_fingerprint) === 1 &&
      draftReconciliationCounts.get(draft.reconciliation_fingerprint) === 1
    ) {
      existingByDraft.set(draft.source_fingerprint, reconciliationMatch);
    }
  }

  const rowsToInsert = drafts
    .filter((draft) => !existingByDraft.has(draft.source_fingerprint))
    .map((draft) => ({
      organization_id: orgId,
      reconciliation_period_id: reconciliationPeriodId,
      statement_import_id: statementImportId,
      source_type: draft.source_type,
      source_fingerprint: draft.source_fingerprint,
      reconciliation_fingerprint: draft.reconciliation_fingerprint,
      raw_description: draft.raw_description,
      normalized_description: normalizeStatementDescription(draft.raw_description),
      amount: draft.amount,
      posted_at: draft.posted_at,
      account_id: draft.account_id,
      account_kind: draft.account_kind,
      fit_id: draft.fit_id,
      line_hash: draft.line_hash,
      installment_number: draft.installment_number ?? null,
      total_installments: draft.total_installments ?? null,
      status: draft.status ?? "pending",
    }));

  let inserted: ExternalStatementItemRow[] = [];
  if (rowsToInsert.length > 0) {
    const { data, error } = await supabase
      .from("external_statement_items")
      .insert(rowsToInsert)
      .select(
        "id, organization_id, reconciliation_period_id, statement_import_id, source_type, source_fingerprint, reconciliation_fingerprint, raw_description, normalized_description, amount, posted_at, account_id, account_kind, fit_id, line_hash, installment_number, total_installments, status",
      );
    if (error) throw new Error(error.message);
    inserted = (data ?? []) as ExternalStatementItemRow[];
  }

  const allExisting = Array.from(existingByDraft.values());
  for (const draft of drafts) {
    const item = existingByDraft.get(draft.source_fingerprint);
    if (!item) continue;
    const { error } = await supabase
      .from("external_statement_items")
      .update({
        reconciliation_period_id: reconciliationPeriodId,
        statement_import_id: statementImportId,
        source_type: draft.source_type,
        source_fingerprint: draft.source_fingerprint,
        reconciliation_fingerprint: draft.reconciliation_fingerprint,
        raw_description: draft.raw_description,
        normalized_description: normalizeStatementDescription(draft.raw_description),
        amount: draft.amount,
        posted_at: draft.posted_at,
        account_id: draft.account_id,
        account_kind: draft.account_kind,
        fit_id: draft.fit_id,
        line_hash: draft.line_hash,
        installment_number: draft.installment_number ?? null,
        total_installments: draft.total_installments ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
  }

  const allItems = [...allExisting, ...inserted];
  const links = await fetchLinksForExternalItems(
    orgId,
    allItems.map((item) => item.id),
  );
  const linksByExternalId = new Map(links.map((link) => [link.external_statement_item_id, link]));
  return drafts
    .map(
      (draft) =>
        inserted.find((item) => item.source_fingerprint === draft.source_fingerprint) ??
        existingByDraft.get(draft.source_fingerprint),
    )
    .filter((item): item is ExternalStatementItemRow => !!item)
    .map((item) => {
      const link = linksByExternalId.get(item.id);
      return {
        ...item,
        link_transaction_id: link?.transaction_id ?? null,
        link_status: link?.status ?? null,
      };
    });
}

export async function recordPersistentReconciliationLink(
  orgId: string,
  item: Pick<
    StatementItemRow,
    | "statement_import_id"
    | "line_hash"
    | "fit_id"
    | "account_id"
    | "account_kind"
    | "posted_at"
    | "amount"
    | "description"
    | "status"
    | "installment_number"
    | "total_installments"
  >,
  input: {
    status: ReconciliationLinkStatus;
    transactionId?: string | null;
    confidence?: number | null;
    matchReason?: string | null;
    matchedBy?: string | null;
  },
): Promise<void> {
  let query = supabase
    .from("external_statement_items")
    .select("id")
    .eq("organization_id", orgId)
    .eq("account_id", item.account_id)
    .eq("account_kind", item.account_kind)
    .eq("posted_at", item.posted_at)
    .eq("amount", item.amount)
    .eq("raw_description", item.description)
    .limit(2);
  query = item.line_hash ? query.eq("line_hash", item.line_hash) : query.is("line_hash", null);
  const { data: externalRows, error: externalErr } = await query;
  if (externalErr) throw new Error(externalErr.message);
  if ((externalRows?.length ?? 0) > 1) {
    throw new Error(
      "Conciliação persistente ambígua: mais de um item externo corresponde ao item legado.",
    );
  }
  let externalItemId = externalRows?.[0]?.id as string | undefined;

  if (!externalItemId) {
    const { data: statementImport, error: importErr } = await supabase
      .from("statement_imports")
      .select("id, source, account_id, account_kind, period_start, period_end")
      .eq("id", item.statement_import_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (importErr) throw new Error(importErr.message);
    if (!statementImport) {
      throw new Error(
        "Não foi possível gravar a conciliação persistente: item externo e import de origem não encontrados.",
      );
    }

    const importSource = String(statementImport.source ?? "").startsWith("pdf") ? "pdf" : "ofx";
    const sourceType = sourceTypeForImport(importSource, item.account_kind);
    const period = await upsertReconciliationPeriod(
      orgId,
      periodFromLines(
        [{ postedAt: item.posted_at, accountId: item.account_id, accountKind: item.account_kind }],
        sourceType === "ofx_checking" ? "account_statement" : "card_invoice",
        {
          periodStart: statementImport.period_start as string | null,
          periodEnd: statementImport.period_end as string | null,
        },
      ),
      { expectedTotal: Number(item.amount) },
    );
    const line = {
      sourceType,
      accountId: item.account_id,
      accountKind: item.account_kind,
      postedAt: item.posted_at,
      amount: Number(item.amount),
      description: item.description,
      fitId: item.fit_id,
      lineHash: item.line_hash,
      installmentNumber: item.installment_number,
      totalInstallments: item.total_installments,
    };
    const [createdExternalItem] = await upsertExternalStatementItems(
      orgId,
      period.id,
      item.statement_import_id,
      [
        {
          source_type: sourceType,
          source_fingerprint: buildSourceFingerprint(line),
          reconciliation_fingerprint: buildReconciliationFingerprint(line),
          raw_description: item.description,
          amount: Number(item.amount),
          posted_at: item.posted_at,
          account_id: item.account_id,
          account_kind: item.account_kind,
          fit_id: item.fit_id,
          line_hash: item.line_hash,
          installment_number: item.installment_number,
          total_installments: item.total_installments,
          status: item.status,
        },
      ],
    );
    externalItemId = createdExternalItem?.id;
    if (!externalItemId) {
      throw new Error(
        "Não foi possível gravar a conciliação persistente: item externo não foi criado.",
      );
    }
  }

  const { error: itemErr } = await supabase
    .from("external_statement_items")
    .update({ status: externalStatusFromLinkStatus(input.status) })
    .eq("id", externalItemId)
    .eq("organization_id", orgId);
  if (itemErr) throw new Error(itemErr.message);

  const { error: linkErr } = await supabase.from("reconciliation_links").upsert(
    {
      organization_id: orgId,
      external_statement_item_id: externalItemId,
      transaction_id: input.transactionId ?? null,
      status: input.status,
      confidence: input.confidence ?? null,
      match_reason: input.matchReason ?? null,
      matched_by: input.matchedBy ?? null,
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,external_statement_item_id" },
  );
  if (linkErr) throw new Error(linkErr.message);
}

const INSTALLMENT_PROJECTION_SELECT =
  "id, organization_id, account_id, account_kind, source_external_item_id, reconciliation_period_id, installment_plan_id, linked_transaction_id, description, normalized_description, installment_number, total_installments, expected_amount, expected_posted_at, expected_competence_month, status, source_type, projection_fingerprint";

async function fetchInstallmentProjectionsByFingerprints(
  orgId: string,
  fingerprints: string[],
): Promise<InstallmentProjectionRow[]> {
  const values = Array.from(new Set(fingerprints)).filter(Boolean);
  if (values.length === 0) return [];
  const { data, error } = await supabase
    .from("installment_projections")
    .select(INSTALLMENT_PROJECTION_SELECT)
    .eq("organization_id", orgId)
    .in("projection_fingerprint", values);
  if (error) throw new Error(error.message);
  return (data ?? []) as InstallmentProjectionRow[];
}

async function fetchProjectionCandidateTransactions(
  orgId: string,
  drafts: InstallmentProjectionDraft[],
): Promise<TxnRow[]> {
  if (drafts.length === 0) return [];
  const accountIds = Array.from(new Set(drafts.map((draft) => draft.account_id)));
  const months = drafts.map((draft) => draft.expected_competence_month).sort();
  const start = `${months[0]}T00:00:00.000Z`;
  const end = `${addMonthsToDateOnly(months[months.length - 1], 1)}T00:00:00.000Z`;
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, spent_by_member_id, statement_import_id, reconciled_statement_item_id, recurring_bill_occurrence_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id, transfer_group_id",
    )
    .eq("organization_id", orgId)
    .eq("account_kind", "credit_card")
    .in("account_id", accountIds)
    .gte("posted_at", start)
    .lt("posted_at", end);
  if (error) throw new Error(error.message);
  return (data ?? []) as TxnRow[];
}

function statusForProjectionInsert(
  draft: InstallmentProjectionDraft,
  candidates: TxnRow[],
  closingDay: number | null | undefined,
): Pick<InstallmentProjectionDraft, "status" | "linked_transaction_id"> {
  const match = chooseProjectionTransactionMatch(draft, candidates, closingDay);
  if (match.kind === "unique")
    return { status: "linked", linked_transaction_id: match.transaction.id };
  if (match.kind === "ambiguous") return { status: "divergent", linked_transaction_id: null };
  return { status: draft.status, linked_transaction_id: draft.linked_transaction_id ?? null };
}

function nextProjectionStatus(
  current: InstallmentProjectionRow,
  incoming: Pick<InstallmentProjectionDraft, "status" | "linked_transaction_id">,
): InstallmentProjectionRow["status"] {
  if (current.status === "ignored" || current.status === "reconciled") return current.status;
  if (incoming.status === "linked") return "linked";
  if (incoming.status === "divergent" && current.status === "detected") return "divergent";
  if (current.status === "linked" && !current.linked_transaction_id) return incoming.status;
  return current.status;
}

export async function upsertInstallmentProjections(
  orgId: string,
  drafts: InstallmentProjectionDraft[],
  closingDay: number | null | undefined,
): Promise<InstallmentProjectionRow[]> {
  if (drafts.length === 0) return [];
  const candidates = await fetchProjectionCandidateTransactions(orgId, drafts);
  const prepared = drafts.map((draft) => ({
    ...draft,
    ...statusForProjectionInsert(draft, candidates, closingDay),
  }));
  const existing = await fetchInstallmentProjectionsByFingerprints(
    orgId,
    prepared.map((draft) => draft.projection_fingerprint),
  );
  const existingByFingerprint = new Map(existing.map((row) => [row.projection_fingerprint, row]));
  const rowsToInsert = prepared
    .filter((draft) => !existingByFingerprint.has(draft.projection_fingerprint))
    .map((draft) => ({
      organization_id: orgId,
      account_id: draft.account_id,
      account_kind: draft.account_kind,
      source_external_item_id: draft.source_external_item_id ?? null,
      reconciliation_period_id: draft.reconciliation_period_id ?? null,
      installment_plan_id: draft.installment_plan_id ?? null,
      linked_transaction_id: draft.linked_transaction_id ?? null,
      description: draft.description,
      normalized_description: draft.normalized_description,
      installment_number: draft.installment_number,
      total_installments: draft.total_installments,
      expected_amount: draft.expected_amount,
      expected_posted_at: draft.expected_posted_at,
      expected_competence_month: draft.expected_competence_month,
      status: draft.status,
      source_type: draft.source_type,
      projection_fingerprint: draft.projection_fingerprint,
    }));

  let inserted: InstallmentProjectionRow[] = [];
  if (rowsToInsert.length > 0) {
    const { data, error } = await supabase
      .from("installment_projections")
      .insert(rowsToInsert)
      .select(INSTALLMENT_PROJECTION_SELECT);
    if (error) throw new Error(error.message);
    inserted = (data ?? []) as InstallmentProjectionRow[];
  }

  const updated: InstallmentProjectionRow[] = [];
  for (const draft of prepared) {
    const current = existingByFingerprint.get(draft.projection_fingerprint);
    if (!current) continue;
    const nextStatus = nextProjectionStatus(current, draft);
    const { data, error } = await supabase
      .from("installment_projections")
      .update({
        source_external_item_id:
          current.source_external_item_id ?? draft.source_external_item_id ?? null,
        reconciliation_period_id:
          current.reconciliation_period_id ?? draft.reconciliation_period_id ?? null,
        installment_plan_id: current.installment_plan_id ?? draft.installment_plan_id ?? null,
        linked_transaction_id: current.linked_transaction_id ?? draft.linked_transaction_id ?? null,
        description: draft.description,
        normalized_description: draft.normalized_description,
        expected_amount: draft.expected_amount,
        expected_posted_at: draft.expected_posted_at,
        expected_competence_month: draft.expected_competence_month,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .eq("organization_id", orgId)
      .select(INSTALLMENT_PROJECTION_SELECT)
      .single();
    if (error) throw new Error(error.message);
    updated.push(data as InstallmentProjectionRow);
  }

  return [...inserted, ...updated];
}

export async function findInstallmentProjectionForStatementItem(
  orgId: string,
  input: {
    accountId: string;
    accountKind: string;
    description: string;
    amount: number;
    postedAt: string;
    installmentNumber: number | null | undefined;
    totalInstallments: number | null | undefined;
    closingDay: number | null | undefined;
  },
): Promise<InstallmentProjectionRow | null> {
  if (!input.installmentNumber || !input.totalInstallments) return null;
  const expectedCompetenceMonth = competenceMonthDateOnly(
    input.postedAt.slice(0, 10),
    input.closingDay ?? null,
  );
  const fingerprint = buildProjectionFingerprint({
    accountId: input.accountId,
    accountKind: input.accountKind,
    normalizedDescription: normalizeStatementDescription(input.description),
    installmentNumber: input.installmentNumber,
    totalInstallments: input.totalInstallments,
    expectedAmount: input.amount,
    expectedCompetenceMonth,
  });
  const { data, error } = await supabase
    .from("installment_projections")
    .select(INSTALLMENT_PROJECTION_SELECT)
    .eq("organization_id", orgId)
    .eq("projection_fingerprint", fingerprint)
    .neq("status", "ignored")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as InstallmentProjectionRow | null;
}

export async function markInstallmentProjectionReconciled(
  orgId: string,
  input: {
    accountId: string;
    accountKind: string;
    description: string;
    amount: number;
    postedAt: string;
    installmentNumber: number | null | undefined;
    totalInstallments: number | null | undefined;
    closingDay: number | null | undefined;
    transactionId: string;
    installmentPlanId: string | null;
  },
): Promise<void> {
  const projection = await findInstallmentProjectionForStatementItem(orgId, input);
  if (!projection) return;
  const { error } = await supabase
    .from("installment_projections")
    .update({
      linked_transaction_id: input.transactionId,
      installment_plan_id: input.installmentPlanId,
      status: "reconciled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", projection.id)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
}
