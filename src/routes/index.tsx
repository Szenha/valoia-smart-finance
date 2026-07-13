import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ImportPanel } from "@/components/finance/ImportPanel";
import { QuickAddForm } from "@/components/finance/QuickAddForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { Button } from "@/components/ui/button";
import {
  extractBatchFn,
  splitTextIntoBatches,
  type AiTransaction,
} from "@/lib/ai/extract-transactions";
import {
  ensureDefaultCategories,
  learnFromConfirmation,
  runClassificationPipeline,
} from "@/lib/classification/pipeline";
import { fetchAccounts, fetchTransactions } from "@/lib/finance/data";
import type { AccountRow, CategoryRow, TxnRow } from "@/lib/finance/types";
import { OfxParseError, parseOfx } from "@/lib/ofx";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  head: () => ({ meta: [{ title: "Calcum — Lançamentos" }] }),
  component: Index,
});

function signedPdfAmount(transaction: AiTransaction) {
  return transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
}

function Index() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [ofxStatus, setOfxStatus] = useState<"idle" | "parsing" | "saving" | "done" | "error">(
    "idle",
  );
  const [ofxMessage, setOfxMessage] = useState("");
  const [pdfStatus, setPdfStatus] = useState<
    "idle" | "extracting" | "analyzing" | "saving" | "done" | "error"
  >("idle");
  const [pdfMessage, setPdfMessage] = useState("");
  const [classifyStatus, setClassifyStatus] = useState("");

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
      const org = await getOrCreateOrganization();
      setOrgId(org);
      await ensureDefaultCategories(org);
    }
    init();
  }, [navigate]);

  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: async () => ensureDefaultCategories(orgId!),
  });

  const transactionsQuery = useQuery({
    queryKey: ["transactions", orgId],
    enabled: !!orgId,
    queryFn: () => fetchTransactions(orgId!),
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccounts(orgId!),
  });

  const classifyMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      setClassifyStatus("Buscando transações sem categoria…");
      return runClassificationPipeline(
        orgId,
        (categoriesQuery.data ?? []) as CategoryRow[],
        setClassifyStatus,
      );
    },
    onSuccess: async (result) => {
      if (result) {
        setClassifyStatus(
          `✓ ${result.classified} classificadas · ${
            result.needsReview > 0 ? `${result.needsReview} para revisão` : "todas com categoria"
          }`,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
    },
    onError: (err) =>
      setClassifyStatus(`Erro: ${err instanceof Error ? err.message : String(err)}`),
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
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
      let newCount = 0;
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

        const rows = stmt.transactions.map((t) => ({
          organization_id: orgId,
          statement_import_id: imp.id,
          amount: t.amount,
          description: t.description,
          memo: t.memo ?? null,
          posted_at: t.postedAt.toISOString(),
          fit_id: t.fitId,
          type: t.type,
          account_id: stmt.account.accountId,
          account_kind: stmt.account.kind,
          bank_id: stmt.account.bankId ?? null,
          currency: t.currency,
          check_number: t.checkNumber ?? null,
          category_id: null,
        }));
        const { count, error: txErr } = await supabase.from("transactions").upsert(rows, {
          onConflict: "organization_id,account_id,fit_id",
          ignoreDuplicates: true,
          count: "exact",
        });
        if (txErr) throw new Error(`transactions: ${txErr.message}`);
        newCount += count ?? 0;
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
      setOfxMessage(`✓ ${doc.statements.length} extrato(s), ${newCount} transação(ões) nova(s).`);
      setOfxStatus("done");
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["accounts", orgId] });
      classifyMutation.mutate();
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
        `A IA encontrou ${transactions.length} transação(ões), totalizando ${new Intl.NumberFormat(
          "pt-BR",
          {
            style: "currency",
            currency: "BRL",
          },
        ).format(total)} em compras. Confirmar importação?`,
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
        category_id: null,
        extraction_confidence: transaction.confidence,
        extraction_source_excerpt: transaction.source_excerpt ?? null,
        original_text: transaction.source_excerpt ?? null,
      }));
      const { count, error: txErr } = await supabase.from("transactions").upsert(rows, {
        onConflict: "organization_id,account_id,fit_id",
        ignoreDuplicates: true,
        count: "exact",
      });
      if (txErr) throw new Error(txErr.message);
      await supabase.from("financial_accounts").upsert(
        {
          organization_id: orgId,
          account_key: "pdf-manual",
          name: "Cartão importado por PDF",
          kind: "credit_card",
        },
        { onConflict: "organization_id,account_key" },
      );
      setPdfMessage(`✓ ${count ?? transactions.length} transação(ões) importadas.`);
      setPdfStatus("done");
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["accounts", orgId] });
      classifyMutation.mutate();
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : String(err));
      setPdfStatus("error");
    }
  }

  async function handleCategoryChange(txn: TxnRow, categoryId: string) {
    if (!orgId) return;
    await learnFromConfirmation(orgId, txn.id, txn.description, categoryId);
    await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
  }

  if (!orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const categories = (categoriesQuery.data ?? []) as CategoryRow[];
  const accounts = (accountsQuery.data ?? []) as AccountRow[];
  const transactions = transactionsQuery.data ?? [];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calcum</h1>
          <p className="text-sm text-muted-foreground">{userEmail}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/dashboard">Dashboard</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/reports">Relatórios</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/settings">Categorias e contas</Link>
          </Button>
          <Button variant="outline" onClick={handleSignOut}>
            Sair
          </Button>
        </nav>
      </header>

      <ImportPanel
        ofxBusy={ofxStatus === "parsing" || ofxStatus === "saving"}
        ofxMessage={ofxMessage}
        ofxError={ofxStatus === "error"}
        pdfBusy={pdfStatus === "extracting" || pdfStatus === "analyzing" || pdfStatus === "saving"}
        pdfMessage={pdfMessage}
        pdfError={pdfStatus === "error"}
        classifying={classifyMutation.isPending}
        classifyStatus={classifyStatus}
        onOfxFile={handleOfxFile}
        onPdfFile={handlePdfFile}
        onClassify={() => classifyMutation.mutate()}
      />
      <QuickAddForm orgId={orgId} categories={categories} accounts={accounts} />
      <TransactionList
        transactions={transactions}
        categories={categories}
        onCategoryChange={handleCategoryChange}
      />
    </main>
  );
}
