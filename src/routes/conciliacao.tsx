import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/finance/AppNav";
import { ImportPanel } from "@/components/finance/ImportPanel";
import { ReconciliationBoard } from "@/components/finance/ReconciliationBoard";
import { Button } from "@/components/ui/button";
import {
  extractBatchFn,
  splitTextIntoBatches,
  type AiTransaction,
} from "@/lib/ai/extract-transactions";
import { OfxParseError, parseOfx } from "@/lib/ofx";
import {
  fetchManualTransactionsForPeriod,
  fetchStatementImports,
  fetchStatementItems,
} from "@/lib/reconciliation/data";
import { suggestStatementMatches } from "@/lib/reconciliation/matching";
import type { StatementImportRow, StatementItemRow } from "@/lib/reconciliation/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/conciliacao")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  head: () => ({ meta: [{ title: "Calcum — Extratos e conciliação" }] }),
  component: ReconciliationRoute,
});

function signedPdfAmount(transaction: AiTransaction) {
  return transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
}

function ReconciliationRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [ofxStatus, setOfxStatus] = useState<"idle" | "parsing" | "saving" | "done" | "error">(
    "idle",
  );
  const [ofxMessage, setOfxMessage] = useState("");
  const [pdfStatus, setPdfStatus] = useState<
    "idle" | "extracting" | "analyzing" | "saving" | "done" | "error"
  >("idle");
  const [pdfMessage, setPdfMessage] = useState("");

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
      setOrgId(await getOrCreateOrganization());
    }
    init();
  }, [navigate]);

  const importsQuery = useQuery({
    queryKey: ["statement-imports", orgId],
    enabled: !!orgId,
    queryFn: () => fetchStatementImports(orgId!),
  });

  const imports = importsQuery.data ?? [];
  const activeImportId = selectedImportId ?? imports[0]?.id ?? null;

  const itemsQuery = useQuery({
    queryKey: ["statement-items", orgId, activeImportId],
    enabled: !!orgId && !!activeImportId,
    queryFn: () => fetchStatementItems(orgId!, activeImportId!),
  });

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  const manualTransactionsQuery = useQuery({
    queryKey: ["manual-transactions-for-reconciliation", orgId, activeImportId, items.length],
    enabled: !!orgId && items.length > 0,
    queryFn: () => fetchManualTransactionsForPeriod(orgId!, items),
  });

  const suggestions = useMemo(
    () => suggestStatementMatches(items, manualTransactionsQuery.data ?? []),
    [items, manualTransactionsQuery.data],
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  async function refreshReconciliation(importId?: string) {
    await queryClient.invalidateQueries({ queryKey: ["statement-imports", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["statement-items", orgId, importId] });
    await queryClient.invalidateQueries({
      queryKey: ["manual-transactions-for-reconciliation", orgId],
    });
  }

  async function handleOfxFile(event: React.ChangeEvent<HTMLInputElement>) {
    if (!orgId) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setOfxMessage("");
    setOfxStatus("parsing");
    let doc;
    try {
      doc = parseOfx(await file.arrayBuffer());
    } catch (err) {
      setOfxMessage(err instanceof OfxParseError ? err.message : String(err));
      setOfxStatus("error");
      return;
    }

    setOfxStatus("saving");
    try {
      let importedItems = 0;
      let lastImportId: string | null = null;
      for (const stmt of doc.statements) {
        const { data: imp, error: impErr } = await supabase
          .from("statement_imports")
          .insert({
            organization_id: orgId,
            filename: file.name,
            account_id: stmt.account.accountId,
            account_kind: stmt.account.kind,
            bank_id: stmt.account.bankId ?? null,
            currency: stmt.account.currency,
            period_start: stmt.periodStart?.toISOString() ?? null,
            period_end: stmt.periodEnd?.toISOString() ?? null,
            transaction_count: stmt.transactions.length,
            status: "completed",
            source: "ofx_manual",
          })
          .select("id")
          .single();
        if (impErr) throw new Error(`statement_imports: ${impErr.message}`);
        lastImportId = imp.id;

        const rows = stmt.transactions.map((t) => ({
          organization_id: orgId,
          statement_import_id: imp.id,
          amount: t.amount,
          description: t.description,
          posted_at: t.postedAt.toISOString(),
          fit_id: t.fitId,
          type: t.type,
          account_id: stmt.account.accountId,
          account_kind: stmt.account.kind,
          bank_id: stmt.account.bankId ?? null,
          currency: t.currency,
          check_number: t.checkNumber ?? null,
          status: "pending",
        }));
        const { error: itemErr } = await supabase.from("statement_items").insert(rows);
        if (itemErr) throw new Error(`statement_items: ${itemErr.message}`);
        importedItems += rows.length;
        await supabase.from("financial_accounts").upsert(
          {
            organization_id: orgId,
            account_key: stmt.account.accountId,
            name: stmt.account.accountId,
            institution: stmt.account.bankId ?? null,
            kind: stmt.account.kind,
          },
          { onConflict: "organization_id,account_key" },
        );
      }
      setSelectedImportId(lastImportId);
      setOfxMessage(
        `✓ ${doc.statements.length} extrato(s), ${importedItems} item(ns) para revisar.`,
      );
      setOfxStatus("done");
      await refreshReconciliation(lastImportId ?? undefined);
    } catch (err) {
      setOfxMessage(err instanceof Error ? err.message : String(err));
      setOfxStatus("error");
    }
  }

  async function handlePdfFile(event: React.ChangeEvent<HTMLInputElement>) {
    if (!orgId) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPdfStatus("extracting");
    setPdfMessage("");
    try {
      const { extractPdfText } = await import("@/lib/pdf/extract-text");
      const text = await extractPdfText(await file.arrayBuffer());
      setPdfStatus("analyzing");
      const batches = splitTextIntoBatches(text);
      const transactions: AiTransaction[] = [];
      for (let i = 0; i < batches.length; i++) {
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
      }
      const total = transactions
        .filter((transaction) => transaction.amount > 0)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const ok = window.confirm(
        `A IA encontrou ${transactions.length} item(ns) de extrato, totalizando ${new Intl.NumberFormat(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL",
          },
        ).format(total)} em compras. Enviar para conciliação?`,
      );
      if (!ok) {
        setPdfMessage("Importação cancelada.");
        setPdfStatus("idle");
        return;
      }

      setPdfStatus("saving");
      const { data: imp, error: impErr } = await supabase
        .from("statement_imports")
        .insert({
          organization_id: orgId,
          filename: file.name,
          account_id: "pdf-manual",
          account_kind: "credit_card",
          currency: "BRL",
          transaction_count: transactions.length,
          status: "completed",
          source: "pdf_manual",
          extracted_total: total,
          requires_review: false,
        })
        .select("id")
        .single();
      if (impErr) throw new Error(impErr.message);

      const rows = transactions.map((transaction) => ({
        organization_id: orgId,
        statement_import_id: imp.id,
        amount: signedPdfAmount(transaction),
        description: transaction.description,
        posted_at: new Date(transaction.date).toISOString(),
        fit_id:
          `PDF-${file.name}-${transaction.date}-${transaction.amount}-${transaction.description}`.slice(
            0,
            255,
          ),
        type: transaction.amount > 0 ? "DEBIT" : "CREDIT",
        account_id: "pdf-manual",
        account_kind: "credit_card",
        currency: "BRL",
        status: "pending",
        extraction_confidence: transaction.confidence,
        extraction_source_excerpt: transaction.source_excerpt ?? null,
      }));
      const { error: itemErr } = await supabase.from("statement_items").insert(rows);
      if (itemErr) throw new Error(itemErr.message);
      await supabase.from("financial_accounts").upsert(
        {
          organization_id: orgId,
          account_key: "pdf-manual",
          name: "Cartão importado por PDF",
          kind: "credit_card",
        },
        { onConflict: "organization_id,account_key" },
      );
      setSelectedImportId(imp.id);
      setPdfMessage(`✓ ${transactions.length} item(ns) enviados para conciliação.`);
      setPdfStatus("done");
      await refreshReconciliation(imp.id);
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : String(err));
      setPdfStatus("error");
    }
  }

  const actionMutation = useMutation({
    mutationFn: async (
      action:
        | { type: "match"; item: StatementItemRow; transactionId: string; confidence: number }
        | { type: "accept"; item: StatementItemRow }
        | { type: "review"; item: StatementItemRow },
    ) => {
      if (!orgId) return;
      if (action.type === "match") {
        const { error: txErr } = await supabase
          .from("transactions")
          .update({
            statement_import_id: action.item.statement_import_id,
            reconciled_statement_item_id: action.item.id,
          })
          .eq("id", action.transactionId)
          .eq("organization_id", orgId);
        if (txErr) throw new Error(txErr.message);
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
        const { data: tx, error: txErr } = await supabase
          .from("transactions")
          .insert({
            organization_id: orgId,
            statement_import_id: action.item.statement_import_id,
            reconciled_statement_item_id: action.item.id,
            amount: action.item.amount,
            description: action.item.description,
            posted_at: action.item.posted_at,
            fit_id: action.item.fit_id ?? `ACCEPTED-${action.item.id}`,
            type: action.item.type,
            account_id: action.item.account_id,
            account_kind: action.item.account_kind,
            currency: action.item.currency,
            category_id: null,
            needs_review: true,
            extraction_confidence: action.item.extraction_confidence,
            extraction_source_excerpt: action.item.extraction_source_excerpt,
            original_text: action.item.extraction_source_excerpt,
          })
          .select("id")
          .single();
        if (txErr) throw new Error(txErr.message);
        const { error: itemErr } = await supabase
          .from("statement_items")
          .update({ matched_transaction_id: tx.id, status: "accepted", match_confidence: 1 })
          .eq("id", action.item.id)
          .eq("organization_id", orgId);
        if (itemErr) throw new Error(itemErr.message);
      }
      if (action.type === "review") {
        const { error } = await supabase
          .from("statement_items")
          .update({ status: "review", match_confidence: null })
          .eq("id", action.item.id)
          .eq("organization_id", orgId);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await refreshReconciliation(activeImportId ?? undefined);
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
    },
  });

  if (!orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Extratos e conciliação</h1>
          <p className="text-sm text-muted-foreground">
            Importe OFX/PDF e compare contra os lançamentos do dia a dia
          </p>
          <p className="text-sm text-muted-foreground">{userEmail}</p>
        </div>
        <AppNav onSignOut={handleSignOut} />
      </header>

      <ImportPanel
        title="Importar para conciliação"
        ofxBusy={ofxStatus === "parsing" || ofxStatus === "saving"}
        ofxMessage={ofxMessage}
        ofxError={ofxStatus === "error"}
        pdfBusy={pdfStatus === "extracting" || pdfStatus === "analyzing" || pdfStatus === "saving"}
        pdfMessage={pdfMessage}
        pdfError={pdfStatus === "error"}
        onOfxFile={handleOfxFile}
        onPdfFile={handlePdfFile}
      />

      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          <h2 className="font-medium">Extratos importados</h2>
          {imports.map((statementImport: StatementImportRow) => (
            <Button
              key={statementImport.id}
              type="button"
              variant={activeImportId === statementImport.id ? "default" : "outline"}
              className="h-auto w-full justify-start text-left"
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
          ))}
          {imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum extrato importado ainda.</p>
          ) : null}
        </div>
        <ReconciliationBoard
          items={items}
          transactions={manualTransactionsQuery.data ?? []}
          suggestions={suggestions}
          busy={actionMutation.isPending}
          onMatch={(item, transaction, confidence) =>
            actionMutation.mutate({
              type: "match",
              item,
              transactionId: transaction.id,
              confidence,
            })
          }
          onAccept={(item) => actionMutation.mutate({ type: "accept", item })}
          onReview={(item) => actionMutation.mutate({ type: "review", item })}
        />
      </section>
      {actionMutation.error ? (
        <p className="text-sm text-red-700">
          {actionMutation.error instanceof Error
            ? actionMutation.error.message
            : String(actionMutation.error)}
        </p>
      ) : null}
    </main>
  );
}
