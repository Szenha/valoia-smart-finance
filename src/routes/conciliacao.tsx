import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { ImportPanel } from "@/components/finance/ImportPanel";
import { PremiumFeatureCard } from "@/components/finance/CommercialGate";
import { ReconciliationBoard } from "@/components/finance/ReconciliationBoard";
import { WorkspaceGate } from "@/components/finance/WorkspaceGate";
import { CategoryPicker } from "@/components/finance/CategoryPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  extractBatchFn,
  splitTextIntoBatches,
  type AiTransaction,
} from "@/lib/ai/extract-transactions";
import { OfxParseError, parseOfx } from "@/lib/ofx";
import { defaultPaymentMethod } from "@/lib/finance/transactionIcons";
import { leafCategoryOptions } from "@/lib/finance/categories";
import {
  fetchAccounts,
  fetchCategories,
  fetchHouseholdMembers,
  fetchMemberProfiles,
} from "@/lib/finance/data";
import { resolveMemberName } from "@/lib/finance/member-visuals";
import { suggestCategoryForDescription } from "@/lib/classification/suggest";
import {
  deleteStatementImport,
  type ExternalStatementItemDraft,
  fetchActiveReconciliationLinkTransactionIds,
  fetchManualTransactionsForPeriod,
  fetchStatementImportByContentHash,
  fetchStatementImports,
  fetchStatementItems,
  markInstallmentProjectionReconciled,
  recordPersistentReconciliationLink,
  type PersistedExternalStatementItem,
  upsertExternalStatementItems,
  upsertInstallmentProjections,
  upsertReconciliationPeriod,
} from "@/lib/reconciliation/data";
import {
  buildFutureInstallmentFitId,
  chooseDuplicateCandidate,
  installmentConflictMessage,
  isReconciliationComplete,
  remainingInstallmentNumbers,
  requireSingleUpdatedTransaction,
} from "@/lib/reconciliation/acceptance";
import {
  assignOccurrences,
  buildStatementLineHash,
  dedupePdfTransactions,
  hashArrayBuffer,
  normalizeStatementDescription,
} from "@/lib/reconciliation/dedup";
import {
  buildInstallmentProjectionDrafts,
  detectOfxInstallmentInText,
  type InstallmentProjectionSourceType,
} from "@/lib/reconciliation/installment-projections";
import {
  anchorPdfTransactionDateToClosingDate,
  inferPdfInvoiceClosingDate,
} from "@/lib/reconciliation/pdf-date-normalization";
import { resolveConfirmedImportAccount } from "@/lib/reconciliation/import-account";
import {
  buildReconciliationFingerprint,
  buildSourceFingerprint,
  legacyStatusFromLinkStatus,
  periodFromLines,
  sourceTypeForImport,
} from "@/lib/reconciliation/persistent";
import {
  capabilitiesFor,
  fetchCommercialSubscription,
  normalizeSubscription,
} from "@/lib/commercial/access";
import { Trash2 } from "lucide-react";
import { suggestStatementMatches } from "@/lib/reconciliation/matching";
import type { AccountRow, CategoryRow, TxnRow } from "@/lib/finance/types";
import type {
  PeriodClosureRow,
  StatementImportRow,
  StatementItemRow,
  StatementItemStatus,
} from "@/lib/reconciliation/types";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/conciliacao")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Extratos e conciliação" }] }),
  component: ReconciliationRoute,
});

function signedPdfAmount(transaction: AiTransaction) {
  return transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
}

function monthStartFromDate(dateLike: string) {
  const date = new Date(dateLike);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function nextMonthStart(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function periodLabel(period: string) {
  return new Date(`${period}T00:00:00.000Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function addMonthsClamped(dateLike: string, delta: number): string {
  const date = new Date(dateLike);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + delta;
  const day = date.getUTCDate();
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, daysInTargetMonth)))
    .toISOString()
    .slice(0, 10);
}

type StatementItemDraft = {
  organization_id: string;
  statement_import_id?: string;
  line_hash: string;
  amount: number;
  description: string;
  posted_at: string;
  fit_id: string | null;
  type: string;
  account_id: string;
  account_kind: string;
  bank_id?: string | null;
  currency: string;
  check_number?: string | null;
  status: StatementItemStatus;
  extraction_confidence?: number | null;
  extraction_source_excerpt?: string | null;
  installment_number?: number | null;
  total_installments?: number | null;
};

type ExistingStatementItem = Pick<
  StatementItemRow,
  "id" | "statement_import_id" | "line_hash" | "matched_transaction_id" | "status"
>;

function friendlyImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("duplicate key") ||
    message.includes("statement_items_organization_id_statement_import_id_fit_id_key") ||
    message.includes("statement_items_org_line_hash_key")
  ) {
    return "Alguns lançamentos deste extrato já tinham sido importados. Atualize a lista e revise apenas os itens novos.";
  }
  return message;
}

async function fetchExistingItemsByLineHash(
  orgId: string,
  lineHashes: string[],
): Promise<ExistingStatementItem[]> {
  const uniqueHashes = Array.from(new Set(lineHashes)).filter(Boolean);
  if (uniqueHashes.length === 0) return [];
  const { data, error } = await supabase
    .from("statement_items")
    .select("id, statement_import_id, line_hash, matched_transaction_id, status")
    .eq("organization_id", orgId)
    .in("line_hash", uniqueHashes);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExistingStatementItem[];
}

async function insertNewStatementItems(
  orgId: string,
  importId: string,
  drafts: StatementItemDraft[],
  persistedExternalItems: PersistedExternalStatementItem[] = [],
): Promise<{ inserted: number; skipped: number; firstExistingImportId: string | null }> {
  const existing = await fetchExistingItemsByLineHash(
    orgId,
    drafts.map((row) => row.line_hash),
  );
  const existingByHash = new Map(existing.map((item) => [item.line_hash, item]));
  for (const row of drafts) {
    if (existingByHash.has(row.line_hash)) continue;
    let query = supabase
      .from("statement_items")
      .select("id, statement_import_id, line_hash, matched_transaction_id, status")
      .eq("organization_id", orgId)
      .eq("account_id", row.account_id)
      .eq("account_kind", row.account_kind)
      .eq("posted_at", row.posted_at)
      .eq("amount", row.amount)
      .eq("description", row.description)
      .limit(1);
    query = row.fit_id ? query.eq("fit_id", row.fit_id) : query.is("fit_id", null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const legacy = data?.[0] as ExistingStatementItem | undefined;
    if (!legacy) continue;
    existingByHash.set(row.line_hash, { ...legacy, line_hash: row.line_hash });
    await supabase
      .from("statement_items")
      .update({ line_hash: row.line_hash })
      .eq("id", legacy.id)
      .eq("organization_id", orgId);
  }
  const rowsToInsert = drafts
    .filter((row) => !existingByHash.has(row.line_hash))
    .map((row) => {
      const externalItem = persistedExternalItems.find((item) => item.line_hash === row.line_hash);
      const restoredStatus = legacyStatusFromPersistentItem(externalItem);
      return {
        ...row,
        statement_import_id: importId,
        status: restoredStatus ?? row.status,
        matched_transaction_id: externalItem?.link_transaction_id ?? null,
        match_confidence: externalItem?.link_transaction_id ? 1 : null,
      };
    });

  if (rowsToInsert.length > 0) {
    const { data: insertedRows, error } = await supabase
      .from("statement_items")
      .insert(rowsToInsert)
      .select("id, matched_transaction_id");
    if (error) throw new Error(friendlyImportError(error));
    for (const insertedRow of insertedRows ?? []) {
      if (!insertedRow.matched_transaction_id) continue;
      await supabase
        .from("transactions")
        .update({ reconciled_statement_item_id: insertedRow.id })
        .eq("id", insertedRow.matched_transaction_id)
        .eq("organization_id", orgId)
        .is("reconciled_statement_item_id", null);
    }
  }

  return {
    inserted: rowsToInsert.length,
    skipped: drafts.length - rowsToInsert.length,
    firstExistingImportId: Array.from(existingByHash.values())[0]?.statement_import_id ?? null,
  };
}

function legacyStatusFromPersistentItem(
  item: PersistedExternalStatementItem | undefined,
): StatementItemStatus | null {
  if (!item?.link_status && (!item?.status || item.status === "pending")) return null;
  return legacyStatusFromLinkStatus("pending", item.link_status, item.status);
}

function externalDraftFromStatementItem(
  row: StatementItemDraft,
  sourceType: ExternalStatementItemDraft["source_type"],
): ExternalStatementItemDraft {
  const line = {
    sourceType,
    accountId: row.account_id,
    accountKind: row.account_kind,
    postedAt: row.posted_at,
    amount: row.amount,
    description: row.description,
    fitId: row.fit_id,
    lineHash: row.line_hash,
    installmentNumber: row.installment_number ?? null,
    totalInstallments: row.total_installments ?? null,
  };
  return {
    source_type: sourceType,
    source_fingerprint: buildSourceFingerprint(line),
    reconciliation_fingerprint: buildReconciliationFingerprint(line),
    raw_description: row.description,
    amount: row.amount,
    posted_at: row.posted_at,
    account_id: row.account_id,
    account_kind: row.account_kind,
    fit_id: row.fit_id,
    line_hash: row.line_hash,
    installment_number: row.installment_number ?? null,
    total_installments: row.total_installments ?? null,
    status: row.status,
  };
}

async function persistFutureInstallmentProjections(input: {
  orgId: string;
  items: PersistedExternalStatementItem[];
  closingDay: number | null | undefined;
}) {
  const drafts = input.items.flatMap((item) => {
    if (item.account_kind !== "credit_card") return [];
    if (item.source_type !== "pdf_card_invoice" && item.source_type !== "ofx_credit_card")
      return [];
    return buildInstallmentProjectionDrafts({
      accountId: item.account_id,
      accountKind: String(item.account_kind),
      description: item.raw_description,
      amount: Number(item.amount),
      postedAt: item.posted_at,
      installmentNumber: item.installment_number,
      totalInstallments: item.total_installments,
      closingDay: input.closingDay,
      sourceType: item.source_type as InstallmentProjectionSourceType,
      sourceExternalItemId: item.id,
      reconciliationPeriodId: item.reconciliation_period_id,
    });
  });
  await upsertInstallmentProjections(input.orgId, drafts, input.closingDay);
}

function ReconciliationRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [ofxStatus, setOfxStatus] = useState<"idle" | "parsing" | "saving" | "done" | "error">(
    "idle",
  );
  const [ofxMessage, setOfxMessage] = useState("");
  const [selectedOfxAccountId, setSelectedOfxAccountId] = useState("");
  const [pdfStatus, setPdfStatus] = useState<
    "idle" | "extracting" | "analyzing" | "saving" | "done" | "error"
  >("idle");
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [selectedPdfCardId, setSelectedPdfCardId] = useState("");
  const [acceptingItem, setAcceptingItem] = useState<StatementItemRow | null>(null);
  const [acceptForm, setAcceptForm] = useState({
    description: "",
    postedAt: "",
    accountId: "",
    categoryId: "none",
    memberId: "",
  });

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/login" });
        return;
      }
      setUserEmail(user.email ?? "");
      setUserId(user.id);
    }
    init();
  }, [navigate]);

  const { orgId, error: orgError, refetchOrganizations } = useActiveOrganization(userId);

  const subscriptionQuery = useQuery({
    queryKey: ["commercial-subscription", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCommercialSubscription(orgId!),
  });
  const capabilities = capabilitiesFor(normalizeSubscription(subscriptionQuery.data));

  const importsQuery = useQuery({
    queryKey: ["statement-imports", orgId],
    enabled: !!orgId,
    queryFn: () => fetchStatementImports(orgId!),
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccounts(orgId!),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });

  const membersQuery = useQuery({
    queryKey: ["household-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchHouseholdMembers(orgId!),
  });

  const memberIds = (membersQuery.data ?? []).map((member) => member.user_id);
  const profilesQuery = useQuery({
    queryKey: ["member-profiles", orgId, memberIds],
    enabled: !!orgId && memberIds.length > 0,
    queryFn: () => fetchMemberProfiles(memberIds),
  });

  const imports = importsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const creditCards = accounts.filter((account) => account.kind === "credit_card");
  const categories = categoriesQuery.data ?? [];
  const categoryItems = leafCategoryOptions(categories);
  const members = membersQuery.data ?? [];
  const profiles = profilesQuery.data ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const activeImportId = selectedImportId ?? imports[0]?.id ?? null;

  const itemsQuery = useQuery({
    queryKey: ["statement-items", orgId, activeImportId],
    enabled: !!orgId && !!activeImportId,
    queryFn: () => fetchStatementItems(orgId!, activeImportId!),
  });

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const activeImport = imports.find((statementImport) => statementImport.id === activeImportId);
  const competencePeriod = items[0] ? monthStartFromDate(items[0].posted_at) : null;
  const scopeType = activeImport?.account_kind === "credit_card" ? "card_invoice" : "account_month";
  const reconciliationComplete = isReconciliationComplete(items);

  const manualTransactionsQuery = useQuery({
    queryKey: ["manual-transactions-for-reconciliation", orgId, activeImportId, items.length],
    enabled: !!orgId && items.length > 0,
    queryFn: () => fetchManualTransactionsForPeriod(orgId!, items),
  });

  const linkedTransactionIdsQuery = useQuery({
    queryKey: [
      "active-reconciliation-link-transaction-ids",
      orgId,
      manualTransactionsQuery.data?.map((transaction) => transaction.id).join(",") ?? "",
    ],
    enabled: !!orgId && !!manualTransactionsQuery.data?.length,
    queryFn: () =>
      fetchActiveReconciliationLinkTransactionIds(
        orgId!,
        (manualTransactionsQuery.data ?? []).map((transaction) => transaction.id),
      ),
  });

  const suggestions = useMemo(
    () =>
      suggestStatementMatches(
        items,
        manualTransactionsQuery.data ?? [],
        linkedTransactionIdsQuery.data ?? [],
      ),
    [items, manualTransactionsQuery.data, linkedTransactionIdsQuery.data],
  );

  const closureQuery = useQuery({
    queryKey: [
      "period-closure",
      orgId,
      activeImport?.account_id,
      activeImport?.account_kind,
      competencePeriod,
    ],
    enabled: !!orgId && !!activeImport && !!competencePeriod,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("period_closures")
        .select(
          "id, scope_type, account_id, account_kind, competence_period, status, closed_by, closed_at, reopened_by, reopened_at",
        )
        .eq("organization_id", orgId!)
        .eq("scope_type", scopeType)
        .eq("account_id", activeImport!.account_id)
        .eq("account_kind", activeImport!.account_kind)
        .eq("competence_period", competencePeriod!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as PeriodClosureRow | null;
    },
  });

  async function refreshReconciliation(importId?: string) {
    await queryClient.invalidateQueries({ queryKey: ["statement-imports", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["statement-items", orgId, importId] });
    await queryClient.invalidateQueries({
      queryKey: ["manual-transactions-for-reconciliation", orgId],
    });
    await queryClient.invalidateQueries({ queryKey: ["card-future-commitments", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["card-installment-projections", orgId] });
  }

  async function handleOfxFile(event: React.ChangeEvent<HTMLInputElement>) {
    if (!orgId) return;
    const selectedAccount = resolveConfirmedImportAccount(accounts, selectedOfxAccountId);
    if (!selectedAccount) {
      setOfxMessage("Selecione a conta ou cartão correspondente antes de importar o OFX.");
      setOfxStatus("error");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setOfxMessage("");
    setOfxStatus("parsing");
    let doc;
    let buffer: ArrayBuffer;
    let contentHash: string;
    try {
      buffer = await file.arrayBuffer();
      contentHash = await hashArrayBuffer(buffer);
      const existingImport = await fetchStatementImportByContentHash(orgId, contentHash);
      if (existingImport) {
        setSelectedImportId(existingImport.id);
        setOfxMessage("✓ Este arquivo já foi importado anteriormente. Nenhum item foi recriado.");
        setOfxStatus("done");
        await refreshReconciliation(existingImport.id);
        return;
      }
      doc = parseOfx(buffer);
    } catch (err) {
      setOfxMessage(err instanceof OfxParseError ? err.message : String(err));
      setOfxStatus("error");
      return;
    }

    setOfxStatus("saving");
    try {
      let importedItems = 0;
      let skippedItems = 0;
      let lastImportId: string | null = null;
      for (const stmt of doc.statements) {
        const confirmedAccountId = selectedAccount.account_key;
        const confirmedAccountKind = selectedAccount.kind;
        const rows = assignOccurrences(
          stmt.transactions.map((t) => ({
            source: "ofx" as const,
            accountId: confirmedAccountId,
            accountKind: confirmedAccountKind,
            postedAt: t.postedAt.toISOString(),
            amount: t.amount,
            description: t.description,
            fitId: t.fitIdGenerated ? null : t.fitId,
            transaction: t,
          })),
        ).map(({ transaction: t, occurrence }) => {
          const installment =
            confirmedAccountKind === "credit_card"
              ? detectOfxInstallmentInText(t.description)
              : null;
          return {
            organization_id: orgId,
            line_hash: buildStatementLineHash({
              source: "ofx",
              accountId: confirmedAccountId,
              accountKind: confirmedAccountKind,
              postedAt: t.postedAt.toISOString(),
              amount: t.amount,
              description: t.description,
              fitId: t.fitIdGenerated ? null : t.fitId,
              occurrence,
            }),
            amount: t.amount,
            description: t.description,
            posted_at: t.postedAt.toISOString(),
            fit_id: t.fitId,
            type: t.type,
            account_id: confirmedAccountId,
            account_kind: confirmedAccountKind,
            bank_id: stmt.account.bankId ?? null,
            currency: t.currency,
            check_number: t.checkNumber ?? null,
            status: "pending" as const,
            installment_number: installment?.installmentNumber ?? null,
            total_installments: installment?.totalInstallments ?? null,
          };
        });
        const existing = await fetchExistingItemsByLineHash(
          orgId,
          rows.map((row) => row.line_hash),
        );
        if (existing.length === rows.length) {
          skippedItems += rows.length;
          lastImportId = existing[0]?.statement_import_id ?? lastImportId;
          continue;
        }

        const { data: imp, error: impErr } = await supabase
          .from("statement_imports")
          .insert({
            organization_id: orgId,
            filename: file.name,
            content_hash: contentHash,
            account_id: confirmedAccountId,
            account_kind: confirmedAccountKind,
            bank_id: stmt.account.bankId ?? null,
            currency: stmt.account.currency,
            period_start: stmt.periodStart?.toISOString() ?? null,
            period_end: stmt.periodEnd?.toISOString() ?? null,
            transaction_count: rows.length - existing.length,
            status: "completed",
            source: "ofx_manual",
          })
          .select("id")
          .single();
        if (impErr) throw new Error(`statement_imports: ${impErr.message}`);
        lastImportId = imp.id;

        const sourceType = sourceTypeForImport("ofx", confirmedAccountKind);
        const period = await upsertReconciliationPeriod(
          orgId,
          periodFromLines(
            rows.map((row) => ({
              postedAt: row.posted_at,
              accountId: row.account_id,
              accountKind: row.account_kind,
            })),
            confirmedAccountKind === "credit_card" ? "card_invoice" : "account_statement",
            {
              periodStart: stmt.periodStart?.toISOString() ?? null,
              periodEnd: stmt.periodEnd?.toISOString() ?? null,
            },
          ),
          {
            expectedTotal: rows.reduce((sum, row) => sum + Number(row.amount), 0),
          },
        );
        const persistedExternalItems = await upsertExternalStatementItems(
          orgId,
          period.id,
          imp.id,
          rows.map((row) => externalDraftFromStatementItem(row, sourceType)),
        );
        await persistFutureInstallmentProjections({
          orgId,
          items: persistedExternalItems,
          closingDay: selectedAccount.closing_day,
        });

        const result = await insertNewStatementItems(orgId, imp.id, rows, persistedExternalItems);
        importedItems += result.inserted;
        skippedItems += result.skipped;
        if (!lastImportId && result.firstExistingImportId)
          lastImportId = result.firstExistingImportId;
      }
      setSelectedImportId(lastImportId);
      setOfxMessage(
        `✓ ${doc.statements.length} extrato(s), ${importedItems} item(ns) novo(s), ${skippedItems} já conhecido(s).`,
      );
      setOfxStatus("done");
      await refreshReconciliation(lastImportId ?? undefined);
    } catch (err) {
      setOfxMessage(friendlyImportError(err));
      setOfxStatus("error");
    }
  }

  async function handlePdfFile(event: React.ChangeEvent<HTMLInputElement>) {
    if (!orgId) return;
    const selectedCard = resolveConfirmedImportAccount(creditCards, selectedPdfCardId);
    if (!selectedCard) {
      setPdfMessage("Selecione um cartão de crédito cadastrado antes de importar a fatura.");
      setPdfStatus("error");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPdfStatus("extracting");
    setPdfMessage("");
    setPdfProgress(2);
    try {
      const buffer = await file.arrayBuffer();
      const contentHash = await hashArrayBuffer(buffer);
      const existingImport = await fetchStatementImportByContentHash(orgId, contentHash);
      if (existingImport) {
        setSelectedImportId(existingImport.id);
        setPdfMessage("✓ Este arquivo já foi importado anteriormente. Nenhum item foi recriado.");
        setPdfProgress(null);
        setPdfStatus("done");
        await refreshReconciliation(existingImport.id);
        return;
      }
      const { extractPdfText } = await import("@/lib/pdf/extract-text");
      const text = await extractPdfText(buffer, ({ page, total }) => {
        const pageProgress = total > 0 ? (page / total) * 30 : 15;
        setPdfProgress(Math.min(30, Math.max(5, pageProgress)));
        setPdfMessage(`Lendo página ${page} de ${total}…`);
      });
      const invoiceClosingDate = inferPdfInvoiceClosingDate(text);
      setPdfStatus("analyzing");
      const batches = splitTextIntoBatches(text);
      const transactions: AiTransaction[] = [];
      for (let i = 0; i < batches.length; i++) {
        const analysisProgress = 30 + (i / Math.max(1, batches.length)) * 60;
        setPdfProgress(Math.min(90, Math.max(30, analysisProgress)));
        setPdfMessage(`Analisando seção ${i + 1} de ${batches.length}…`);
        const result = await extractBatchFn({
          data: {
            batchText: batches[i],
            filename: file.name,
            batchIndex: i,
            totalBatches: batches.length,
          },
        });
        transactions.push(...result.transactions);
        setPdfProgress(30 + ((i + 1) / Math.max(1, batches.length)) * 60);
      }
      const uniqueTransactions = dedupePdfTransactions(
        transactions.map((transaction) => ({
          ...transaction,
          date: anchorPdfTransactionDateToClosingDate(transaction.date, invoiceClosingDate),
        })),
      );
      const total = uniqueTransactions
        .filter((transaction) => transaction.amount > 0)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const ok = await confirm({
        title: "Enviar para conciliação",
        description: `A IA encontrou ${uniqueTransactions.length} item(ns) de extrato para ${selectedCard.name}, totalizando ${new Intl.NumberFormat(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL",
          },
        ).format(total)} em compras. Enviar para conciliação?`,
        confirmLabel: "Enviar",
      });
      if (!ok) {
        setPdfMessage("Importação cancelada.");
        setPdfProgress(null);
        setPdfStatus("idle");
        return;
      }

      setPdfStatus("saving");
      setPdfProgress(94);
      const rows = assignOccurrences(
        uniqueTransactions.map((transaction) => {
          const amount = signedPdfAmount(transaction);
          const postedAt = new Date(transaction.date).toISOString();
          return {
            source: "pdf" as const,
            accountId: selectedCard.account_key,
            accountKind: "credit_card",
            postedAt,
            amount,
            description: transaction.description,
            fitId: null,
            transaction,
          };
        }),
      ).map(({ transaction, occurrence, amount, postedAt }) => {
        const lineHash = buildStatementLineHash({
          source: "pdf",
          accountId: selectedCard.account_key,
          accountKind: "credit_card",
          postedAt,
          amount,
          description: transaction.description,
          fitId: null,
          occurrence,
        });
        return {
          organization_id: orgId,
          line_hash: lineHash,
          amount,
          description: transaction.description,
          posted_at: postedAt,
          fit_id: `PDF-${lineHash}`,
          type: transaction.amount > 0 ? "DEBIT" : "CREDIT",
          account_id: selectedCard.account_key,
          account_kind: "credit_card",
          currency: "BRL",
          status: "pending" as const,
          extraction_confidence: transaction.confidence,
          extraction_source_excerpt: transaction.source_excerpt ?? null,
          installment_number: transaction.installment_number ?? null,
          total_installments: transaction.total_installments ?? null,
        };
      });
      const existing = await fetchExistingItemsByLineHash(
        orgId,
        rows.map((row) => row.line_hash),
      );
      if (existing.length === rows.length) {
        setSelectedImportId(existing[0]?.statement_import_id ?? null);
        setPdfMessage(`✓ Esta fatura já tinha sido importada. Nenhum item duplicado foi criado.`);
        setPdfProgress(null);
        setPdfStatus("done");
        await refreshReconciliation(existing[0]?.statement_import_id ?? undefined);
        return;
      }

      const { data: imp, error: impErr } = await supabase
        .from("statement_imports")
        .insert({
          organization_id: orgId,
          filename: file.name,
          content_hash: contentHash,
          account_id: selectedCard.account_key,
          account_kind: "credit_card",
          currency: "BRL",
          transaction_count: rows.length - existing.length,
          status: "completed",
          source: "pdf_manual",
          extracted_total: total,
          requires_review: false,
        })
        .select("id")
        .single();
      if (impErr) throw new Error(impErr.message);

      const period = await upsertReconciliationPeriod(
        orgId,
        periodFromLines(
          rows.map((row) => ({
            postedAt: row.posted_at,
            accountId: row.account_id,
            accountKind: row.account_kind,
          })),
          "card_invoice",
        ),
        {
          expectedTotal: rows.reduce((sum, row) => sum + Number(row.amount), 0),
        },
      );
      const persistedExternalItems = await upsertExternalStatementItems(
        orgId,
        period.id,
        imp.id,
        rows.map((row) => externalDraftFromStatementItem(row, "pdf_card_invoice")),
      );
      await persistFutureInstallmentProjections({
        orgId,
        items: persistedExternalItems,
        closingDay: selectedCard.closing_day,
      });

      const result = await insertNewStatementItems(orgId, imp.id, rows, persistedExternalItems);
      setSelectedImportId(imp.id);
      setPdfMessage(
        `✓ ${result.inserted} item(ns) novo(s) enviados para conciliação; ${result.skipped} já conhecido(s).`,
      );
      setPdfProgress(null);
      setPdfStatus("done");
      await refreshReconciliation(imp.id);
    } catch (err) {
      setPdfProgress(null);
      setPdfMessage(friendlyImportError(err));
      setPdfStatus("error");
    }
  }

  const actionMutation = useMutation({
    mutationFn: async (
      action:
        | { type: "match"; item: StatementItemRow; transactionId: string; confidence: number }
        | {
            type: "accept";
            item: StatementItemRow;
            description: string;
            postedAt: string;
            account: AccountRow;
            categoryId: string | null;
            memberId: string | null;
          }
        | { type: "review"; item: StatementItemRow }
        | { type: "ignore"; item: StatementItemRow },
    ) => {
      if (!orgId) return;
      if (action.type === "match") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: updatedRows, error: txErr } = await supabase
          .from("transactions")
          .update({
            reconciled_statement_item_id: action.item.id,
          })
          .eq("id", action.transactionId)
          .eq("organization_id", orgId)
          .is("reconciled_statement_item_id", null)
          .select("id");
        if (txErr) throw new Error(txErr.message);
        requireSingleUpdatedTransaction(updatedRows);
        await recordPersistentReconciliationLink(orgId, action.item, {
          status: "matched",
          transactionId: action.transactionId,
          confidence: action.confidence,
          matchReason: "manual_match",
          matchedBy: user?.id ?? null,
        });
        const { error: itemErr } = await supabase
          .from("statement_items")
          .update({
            matched_transaction_id: action.transactionId,
            status: "matched",
            match_confidence: action.confidence,
          })
          .eq("id", action.item.id)
          .eq("organization_id", orgId);
        if (itemErr) throw new Error(itemErr.message);
      }
      if (action.type === "accept") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");
        const parentImport = imports.find((imp) => imp.id === action.item.statement_import_id);
        const entrySource = parentImport?.source === "pdf_manual" ? "pdf_import" : "ofx_import";
        const isInstallmentItem =
          !!action.item.installment_number &&
          !!action.item.total_installments &&
          action.item.total_installments > 1 &&
          action.account.kind === "credit_card";

        if (!isInstallmentItem) {
          const duplicateQuery = await supabase
            .from("transactions")
            .select(
              "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, spent_by_member_id, statement_import_id, reconciled_statement_item_id, recurring_bill_occurrence_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id, transfer_group_id",
            )
            .eq("organization_id", orgId)
            .eq("account_id", action.account.account_key)
            .eq("account_kind", action.account.kind)
            .eq("amount", action.item.amount)
            .eq("posted_at", new Date(action.postedAt).toISOString())
            .is("reconciled_statement_item_id", null);
          if (duplicateQuery.error) throw new Error(duplicateQuery.error.message);
          const duplicateDecision = chooseDuplicateCandidate(
            (duplicateQuery.data ?? []) as TxnRow[],
            action.description,
          );
          if (duplicateDecision.kind === "ambiguous") {
            throw new Error(installmentConflictMessage(duplicateDecision.transactions.length));
          }
          if (duplicateDecision.kind === "unique") {
            const duplicateId = duplicateDecision.transaction.id;
            const { data: updatedRows, error: txErr } = await supabase
              .from("transactions")
              .update({
                reconciled_statement_item_id: action.item.id,
              })
              .eq("id", duplicateId)
              .eq("organization_id", orgId)
              .is("reconciled_statement_item_id", null)
              .select("id");
            if (txErr) throw new Error(txErr.message);
            requireSingleUpdatedTransaction(updatedRows);
            await recordPersistentReconciliationLink(orgId, action.item, {
              status: "matched",
              transactionId: duplicateId,
              confidence: 1,
              matchReason: "manual_duplicate_reuse",
              matchedBy: user.id,
            });
            const { error: itemErr } = await supabase
              .from("statement_items")
              .update({
                matched_transaction_id: duplicateId,
                status: "matched",
                match_confidence: 1,
              })
              .eq("id", action.item.id)
              .eq("organization_id", orgId);
            if (itemErr) throw new Error(itemErr.message);
            return;
          }
        }

        let installmentPlanId: string | null = null;
        if (isInstallmentItem) {
          const descriptionNormalized = normalizeStatementDescription(action.description);
          const installmentAmount = Math.abs(Number(action.item.amount));
          const { data: existingPlans, error: existingPlanErr } = await supabase
            .from("installment_plans")
            .select("id, current_installment_paid")
            .eq("organization_id", orgId)
            .eq("account_id", action.account.account_key)
            .eq("description_normalized", descriptionNormalized)
            .eq("total_installments", action.item.total_installments)
            .eq("installment_amount", installmentAmount)
            .neq("status", "cancelado")
            .limit(1);
          if (existingPlanErr) throw new Error(existingPlanErr.message);
          installmentPlanId = (existingPlans?.[0]?.id as string | undefined) ?? null;
          if (!installmentPlanId) {
            const { data: plan, error: planErr } = await supabase
              .from("installment_plans")
              .insert({
                organization_id: orgId,
                account_id: action.account.account_key,
                description_normalized: descriptionNormalized,
                total_installments: action.item.total_installments,
                installment_amount: installmentAmount,
                first_seen_statement_import_id: action.item.statement_import_id,
                current_installment_paid: action.item.installment_number,
                confirmed_by: user.id,
              })
              .select("id")
              .single();
            if (planErr) throw new Error(planErr.message);
            installmentPlanId = plan.id as string;
          } else {
            const currentPaid = Number(existingPlans?.[0]?.current_installment_paid ?? 0);
            if ((action.item.installment_number ?? 0) > currentPaid) {
              const { error: updatePlanErr } = await supabase
                .from("installment_plans")
                .update({
                  current_installment_paid: action.item.installment_number,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", installmentPlanId);
              if (updatePlanErr) throw new Error(updatePlanErr.message);
            }
          }
        }

        let reconciledTransactionId: string | null = null;
        let persistentLinkRecorded = false;
        if (installmentPlanId && action.item.installment_number) {
          const { data: projectedRows, error: projectionErr } = await supabase
            .from("transactions")
            .select(
              "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, spent_by_member_id, statement_import_id, reconciled_statement_item_id, recurring_bill_occurrence_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id, transfer_group_id",
            )
            .eq("organization_id", orgId)
            .eq("installment_plan_id", installmentPlanId)
            .eq("installment_number", action.item.installment_number)
            .is("reconciled_statement_item_id", null)
            .limit(2);
          if (projectionErr) throw new Error(projectionErr.message);
          const projected = (projectedRows ?? []) as TxnRow[];
          if (projected.length > 1) {
            throw new Error(installmentConflictMessage(projected.length));
          }
          if (projected[0]) {
            const { data: updatedRows, error: updateProjectionErr } = await supabase
              .from("transactions")
              .update({
                reconciled_statement_item_id: action.item.id,
                amount: action.item.amount,
                description: action.description,
                posted_at: new Date(action.postedAt).toISOString(),
                fit_id: action.item.fit_id ?? projected[0].id,
                type: action.item.type,
                account_id: action.account.account_key,
                account_kind: action.account.kind,
                payment_method: defaultPaymentMethod(action.account.kind),
                currency: action.item.currency,
                spent_by_member_id: action.memberId,
                category_id: action.categoryId,
                classification_method: action.categoryId ? "manual" : null,
                classification_confidence: action.categoryId ? 1 : null,
                needs_review: !action.categoryId,
                extraction_confidence: action.item.extraction_confidence,
                extraction_source_excerpt: action.item.extraction_source_excerpt,
                original_text: action.item.extraction_source_excerpt,
              })
              .eq("id", projected[0].id)
              .eq("organization_id", orgId)
              .is("reconciled_statement_item_id", null)
              .select("id");
            if (updateProjectionErr) throw new Error(updateProjectionErr.message);
            const updatedTx = requireSingleUpdatedTransaction(updatedRows);
            reconciledTransactionId = updatedTx.id as string;
            await recordPersistentReconciliationLink(orgId, action.item, {
              status: "edited_existing",
              transactionId: reconciledTransactionId,
              confidence: 1,
              matchReason: "installment_projection_reuse",
              matchedBy: user.id,
            });
            persistentLinkRecorded = true;
          }
        }

        if (!reconciledTransactionId && isInstallmentItem && installmentPlanId) {
          const duplicateQuery = await supabase
            .from("transactions")
            .select(
              "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, spent_by_member_id, statement_import_id, reconciled_statement_item_id, recurring_bill_occurrence_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, original_text, consolidation_status, period_closure_id, transfer_group_id",
            )
            .eq("organization_id", orgId)
            .eq("account_id", action.account.account_key)
            .eq("account_kind", action.account.kind)
            .eq("amount", action.item.amount)
            .eq("posted_at", new Date(action.postedAt).toISOString())
            .is("installment_plan_id", null)
            .is("reconciled_statement_item_id", null);
          if (duplicateQuery.error) throw new Error(duplicateQuery.error.message);
          const duplicateDecision = chooseDuplicateCandidate(
            (duplicateQuery.data ?? []) as TxnRow[],
            action.description,
          );
          if (duplicateDecision.kind === "ambiguous") {
            throw new Error(installmentConflictMessage(duplicateDecision.transactions.length));
          }
          if (duplicateDecision.kind === "unique") {
            const { data: updatedRows, error: txErr } = await supabase
              .from("transactions")
              .update({
                reconciled_statement_item_id: action.item.id,
                installment_plan_id: installmentPlanId,
                installment_number: action.item.installment_number,
                description: action.description,
                category_id: action.categoryId,
                spent_by_member_id: action.memberId,
                classification_method: action.categoryId ? "manual" : null,
                classification_confidence: action.categoryId ? 1 : null,
                needs_review: !action.categoryId,
              })
              .eq("id", duplicateDecision.transaction.id)
              .eq("organization_id", orgId)
              .is("installment_plan_id", null)
              .is("reconciled_statement_item_id", null)
              .select("id");
            if (txErr) throw new Error(txErr.message);
            const updatedTx = requireSingleUpdatedTransaction(updatedRows);
            reconciledTransactionId = updatedTx.id as string;
            await recordPersistentReconciliationLink(orgId, action.item, {
              status: "matched",
              transactionId: reconciledTransactionId,
              confidence: 1,
              matchReason: "manual_installment_reuse",
              matchedBy: user.id,
            });
            persistentLinkRecorded = true;
          }
        }

        let createdAcceptedTransaction = false;
        if (!reconciledTransactionId) {
          const { data: tx, error: txErr } = await supabase
            .from("transactions")
            .insert({
              organization_id: orgId,
              statement_import_id: action.item.statement_import_id,
              reconciled_statement_item_id: action.item.id,
              amount: action.item.amount,
              description: action.description,
              posted_at: new Date(action.postedAt).toISOString(),
              fit_id: action.item.fit_id ?? `ACCEPTED-${action.item.id}`,
              type: action.item.type,
              account_id: action.account.account_key,
              account_kind: action.account.kind,
              payment_method: defaultPaymentMethod(action.account.kind),
              entry_source: entrySource,
              currency: action.item.currency,
              created_by: user.id,
              spent_by_member_id: action.memberId,
              category_id: action.categoryId,
              installment_plan_id: installmentPlanId,
              installment_number: action.item.installment_number,
              classification_method: action.categoryId ? "manual" : null,
              classification_confidence: action.categoryId ? 1 : null,
              needs_review: !action.categoryId,
              extraction_confidence: action.item.extraction_confidence,
              extraction_source_excerpt: action.item.extraction_source_excerpt,
              original_text: action.item.extraction_source_excerpt,
            })
            .select("id")
            .single();
          if (txErr) throw new Error(txErr.message);
          reconciledTransactionId = tx.id as string;
          createdAcceptedTransaction = true;
        }

        if (!persistentLinkRecorded) {
          await recordPersistentReconciliationLink(orgId, action.item, {
            status: createdAcceptedTransaction ? "accepted_new" : "matched",
            transactionId: reconciledTransactionId,
            confidence: 1,
            matchReason: createdAcceptedTransaction
              ? "accepted_new_transaction"
              : "accepted_existing_transaction",
            matchedBy: user.id,
          });
        }
        const { error: itemErr } = await supabase
          .from("statement_items")
          .update({
            matched_transaction_id: reconciledTransactionId,
            status: "accepted",
            match_confidence: 1,
          })
          .eq("id", action.item.id)
          .eq("organization_id", orgId);
        if (itemErr) throw new Error(itemErr.message);

        await markInstallmentProjectionReconciled(orgId, {
          accountId: action.account.account_key,
          accountKind: action.account.kind,
          description: action.description,
          amount: Number(action.item.amount),
          postedAt: action.postedAt,
          installmentNumber: action.item.installment_number,
          totalInstallments: action.item.total_installments,
          closingDay: action.account.closing_day,
          transactionId: reconciledTransactionId,
          installmentPlanId,
        });

        if (
          installmentPlanId &&
          action.item.installment_number &&
          action.item.total_installments &&
          action.item.installment_number < action.item.total_installments
        ) {
          const futureRows = [];
          for (const number of remainingInstallmentNumbers(action.item)) {
            futureRows.push({
              organization_id: orgId,
              description: action.description,
              type: action.item.type,
              account_id: action.account.account_key,
              account_kind: action.account.kind,
              payment_method: defaultPaymentMethod(action.account.kind),
              entry_source: "manual",
              currency: action.item.currency,
              created_by: user.id,
              spent_by_member_id: action.memberId,
              category_id: action.categoryId,
              amount: action.item.amount,
              posted_at: new Date(
                addMonthsClamped(action.postedAt, number - action.item.installment_number),
              ).toISOString(),
              fit_id: buildFutureInstallmentFitId(installmentPlanId, number),
              installment_plan_id: installmentPlanId,
              installment_number: number,
              classification_method: action.categoryId ? "manual" : null,
              classification_confidence: action.categoryId ? 1 : null,
              needs_review: !action.categoryId,
            });
          }
          const { error: futureErr } = await supabase.from("transactions").upsert(futureRows, {
            onConflict: "organization_id,installment_plan_id,installment_number",
          });
          if (futureErr) throw new Error(futureErr.message);
          const projectionSourceType: InstallmentProjectionSourceType =
            entrySource === "pdf_import" ? "pdf_card_invoice" : "ofx_credit_card";
          await upsertInstallmentProjections(
            orgId,
            buildInstallmentProjectionDrafts({
              accountId: action.account.account_key,
              accountKind: action.account.kind,
              description: action.description,
              amount: Number(action.item.amount),
              postedAt: action.postedAt,
              installmentNumber: action.item.installment_number,
              totalInstallments: action.item.total_installments,
              closingDay: action.account.closing_day,
              sourceType: projectionSourceType,
              installmentPlanId,
            }),
            action.account.closing_day,
          );
        }
      }
      if (action.type === "review") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await recordPersistentReconciliationLink(orgId, action.item, {
          status: "review",
          matchReason: "marked_for_review",
          matchedBy: user?.id ?? null,
        });
        const { error } = await supabase
          .from("statement_items")
          .update({ status: "review", match_confidence: null })
          .eq("id", action.item.id)
          .eq("organization_id", orgId);
        if (error) throw new Error(error.message);
      }
      if (action.type === "ignore") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await recordPersistentReconciliationLink(orgId, action.item, {
          status: "ignored",
          matchReason: "ignored_by_user",
          matchedBy: user?.id ?? null,
        });
        const { error } = await supabase
          .from("statement_items")
          .update({ status: "ignored", match_confidence: null })
          .eq("id", action.item.id)
          .eq("organization_id", orgId);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await refreshReconciliation(activeImportId ?? undefined);
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["card-summary", orgId] });
    },
  });

  const deleteImportMutation = useMutation({
    mutationFn: async (importId: string) => {
      if (!orgId) return;
      await deleteStatementImport(orgId, importId);
    },
    onSuccess: async (_data, importId) => {
      if (selectedImportId === importId) setSelectedImportId(null);
      await refreshReconciliation();
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["card-summary", orgId] });
    },
  });

  async function openAcceptDialog(item: StatementItemRow) {
    const account =
      accounts.find(
        (candidate) =>
          candidate.account_key === item.account_id && candidate.kind === item.account_kind,
      ) ?? accounts[0];
    setAcceptingItem(item);
    setAcceptForm({
      description: item.description,
      postedAt: item.posted_at.slice(0, 10),
      accountId: account?.id ?? "",
      categoryId: "none",
      memberId: userId ?? "",
    });
    try {
      const suggestion = await suggestCategoryForDescription(
        orgId!,
        item.description,
        Number(item.amount),
        String(item.account_kind),
        categories,
      );
      if (suggestion.category_id) {
        setAcceptForm((current) =>
          acceptingItem?.id === item.id || current.description === item.description
            ? { ...current, categoryId: suggestion.category_id! }
            : current,
        );
      }
    } catch {
      // Sugestão é auxiliar; falha nela não bloqueia a criação classificada manualmente.
    }
  }

  function submitAcceptDialog() {
    if (!acceptingItem) return;
    const account = accounts.find((candidate) => candidate.id === acceptForm.accountId);
    if (!account) return;
    actionMutation.mutate({
      type: "accept",
      item: acceptingItem,
      description: acceptForm.description,
      postedAt: acceptForm.postedAt,
      account,
      categoryId: acceptForm.categoryId === "none" ? null : acceptForm.categoryId,
      memberId: acceptForm.memberId || null,
    });
    setAcceptingItem(null);
  }

  async function handleDeleteImport(statementImport: StatementImportRow) {
    const ok = await confirm({
      title: "Excluir extrato",
      description: `Excluir o extrato "${statementImport.filename}"? Isso também apaga ${statementImport.transaction_count} lançamento(s) importados dele. Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    deleteImportMutation.mutate(statementImport.id);
  }

  const closureMutation = useMutation({
    mutationFn: async (action: "close" | "reopen") => {
      if (!orgId || !activeImport || !competencePeriod) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      if (action === "close" && !reconciliationComplete) {
        throw new Error("Resolva todos os itens do extrato antes de fechar o período.");
      }

      const { data: closure, error: closureErr } = await supabase
        .from("period_closures")
        .upsert(
          {
            organization_id: orgId,
            scope_type: scopeType,
            account_id: activeImport.account_id,
            account_kind: activeImport.account_kind,
            competence_period: competencePeriod,
            status: action === "close" ? "fechado" : "aberto",
            closed_by: action === "close" ? user.id : (closureQuery.data?.closed_by ?? null),
            closed_at:
              action === "close"
                ? new Date().toISOString()
                : (closureQuery.data?.closed_at ?? null),
            reopened_by: action === "reopen" ? user.id : null,
            reopened_at: action === "reopen" ? new Date().toISOString() : null,
          },
          {
            onConflict: "organization_id,scope_type,account_id,account_kind,competence_period",
          },
        )
        .select("id")
        .single();
      if (closureErr) throw new Error(closureErr.message);

      const start = `${competencePeriod}T00:00:00.000Z`;
      const end = `${nextMonthStart(competencePeriod)}T00:00:00.000Z`;
      const { error: txErr } = await supabase
        .from("transactions")
        .update(
          action === "close"
            ? {
                consolidation_status: "consolidado",
                period_closure_id: closure.id,
              }
            : {
                consolidation_status: "aberto",
                period_closure_id: null,
              },
        )
        .eq("organization_id", orgId)
        .eq("account_id", activeImport.account_id)
        .eq("account_kind", activeImport.account_kind)
        .gte("posted_at", start)
        .lt("posted_at", end);
      if (txErr) throw new Error(txErr.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["period-closure", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
      await refreshReconciliation(activeImportId ?? undefined);
    },
  });

  if (!orgId || subscriptionQuery.isLoading) {
    return <WorkspaceGate error={orgError} onRetry={() => refetchOrganizations()} fullScreen />;
  }

  if (!capabilities.canUseImport) {
    return (
      <AppShell
        activeSection="conciliacao"
        title="Extratos e conciliação"
        subtitle="Importe OFX/PDF e compare contra os lançamentos do dia a dia"
        userEmail={userEmail}
      >
        <PremiumFeatureCard
          title="Conciliação fica no plano Família"
          description="Importar extratos e conciliar com os lançamentos do dia a dia é um recurso do plano Família. No trial e no plano Individual, use o lançamento manual ou por voz."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      activeSection="conciliacao"
      title="Extratos e conciliação"
      subtitle="Importe OFX/PDF e compare contra os lançamentos do dia a dia"
      userEmail={userEmail}
    >
      <ImportPanel
        title="Importar para conciliação"
        ofxBusy={ofxStatus === "parsing" || ofxStatus === "saving"}
        ofxMessage={ofxMessage}
        ofxError={ofxStatus === "error"}
        accounts={accounts}
        selectedOfxAccountId={selectedOfxAccountId}
        onOfxAccountChange={setSelectedOfxAccountId}
        pdfBusy={pdfStatus === "extracting" || pdfStatus === "analyzing" || pdfStatus === "saving"}
        pdfMessage={pdfMessage}
        pdfError={pdfStatus === "error"}
        pdfProgress={pdfProgress}
        creditCards={creditCards}
        selectedPdfCardId={selectedPdfCardId}
        onPdfCardChange={setSelectedPdfCardId}
        onOfxFile={handleOfxFile}
        onPdfFile={handlePdfFile}
      />

      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          <h2 className="font-medium">Extratos importados</h2>
          {imports.map((statementImport: StatementImportRow) => (
            <div key={statementImport.id} className="flex items-center gap-1">
              <Button
                type="button"
                variant={activeImportId === statementImport.id ? "default" : "outline"}
                className="h-auto flex-1 justify-start text-left"
                onClick={() => setSelectedImportId(statementImport.id)}
              >
                <span>
                  <span className="block">{statementImport.filename}</span>
                  <span className="block text-xs opacity-80">
                    {statementImport.transaction_count} item(ns) ·{" "}
                    {new Date(statementImport.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
                aria-label="Excluir extrato"
                disabled={deleteImportMutation.isPending}
                onClick={() => handleDeleteImport(statementImport)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum extrato importado ainda.</p>
          ) : null}
          {deleteImportMutation.error ? (
            <p className="text-sm text-red-600">
              {deleteImportMutation.error instanceof Error
                ? deleteImportMutation.error.message
                : String(deleteImportMutation.error)}
            </p>
          ) : null}
        </div>
        <ReconciliationBoard
          items={items}
          transactions={manualTransactionsQuery.data ?? []}
          suggestions={suggestions}
          busy={actionMutation.isPending}
          source={activeImport?.source ?? null}
          onMatch={(item, transaction, confidence) =>
            actionMutation.mutate({
              type: "match",
              item,
              transactionId: transaction.id,
              confidence,
            })
          }
          onAccept={openAcceptDialog}
          onReview={(item) => actionMutation.mutate({ type: "review", item })}
          onIgnore={(item) => actionMutation.mutate({ type: "ignore", item })}
        />
      </section>
      <Dialog open={!!acceptingItem} onOpenChange={(open) => !open && setAcceptingItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aceitar e classificar</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Descrição</Label>
              <Input
                value={acceptForm.description}
                onChange={(event) =>
                  setAcceptForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={acceptForm.postedAt}
                  onChange={(event) =>
                    setAcceptForm((current) => ({ ...current, postedAt: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Conta/cartão</Label>
                <Select
                  value={acceptForm.accountId}
                  onValueChange={(value) =>
                    setAcceptForm((current) => ({ ...current, accountId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <CategoryPicker
                  options={categoryItems}
                  value={acceptForm.categoryId === "none" ? null : acceptForm.categoryId}
                  onChange={(value) =>
                    setAcceptForm((current) => ({ ...current, categoryId: value || "none" }))
                  }
                />
              </div>
              <div>
                <Label>Membro</Label>
                <Select
                  value={acceptForm.memberId}
                  onValueChange={(value) =>
                    setAcceptForm((current) => ({ ...current, memberId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.user_id === userId
                          ? "Eu"
                          : resolveMemberName(
                              memberById.get(member.user_id),
                              profileById.get(member.user_id),
                              member.user_id,
                            )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {acceptingItem?.installment_number && acceptingItem.total_installments ? (
              <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
                Parcela {acceptingItem.installment_number}/{acceptingItem.total_installments}. Ao
                salvar, as parcelas futuras faltantes serão criadas no cartão.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAcceptingItem(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!acceptForm.description || !acceptForm.postedAt || !acceptForm.accountId}
              onClick={submitAcceptDialog}
            >
              Salvar conciliado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {activeImport && competencePeriod ? (
        <Card>
          <CardHeader>
            <CardTitle>Fechamento do período</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={closureQuery.data?.status === "fechado" ? "default" : "outline"}>
              {closureQuery.data?.status === "fechado" ? "Fechado" : "Aberto"}
            </Badge>
            <span className="text-muted-foreground">
              {activeImport.account_kind === "credit_card" ? "Fatura" : "Mês"} de{" "}
              {periodLabel(competencePeriod)}
            </span>
            <span className="text-muted-foreground">
              {reconciliationComplete
                ? "Todos os itens do extrato foram tratados."
                : "Ainda existem itens pendentes."}
            </span>
            {closureQuery.data?.status === "fechado" ? (
              <Button
                type="button"
                variant="outline"
                disabled={closureMutation.isPending}
                onClick={() => closureMutation.mutate("reopen")}
              >
                Reabrir período
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!reconciliationComplete || closureMutation.isPending}
                onClick={() => closureMutation.mutate("close")}
              >
                Fechar período
              </Button>
            )}
            {closureMutation.error ? (
              <span className="text-red-700">
                {closureMutation.error instanceof Error
                  ? closureMutation.error.message
                  : String(closureMutation.error)}
              </span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {actionMutation.error ? (
        <p className="text-sm text-red-700">
          {actionMutation.error instanceof Error
            ? actionMutation.error.message
            : String(actionMutation.error)}
        </p>
      ) : null}
    </AppShell>
  );
}
