import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { OfxParseError, parseOfx } from "@/lib/ofx";
import { supabase } from "@/lib/supabase/client";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import {
  extractBatchFn,
  splitTextIntoBatches,
  type AiTransaction,
} from "@/lib/ai/extract-transactions";
import {
  ensureDefaultCategories,
  runClassificationPipeline,
  learnFromConfirmation,
  type CategoryRow,
} from "@/lib/classification/pipeline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

type TxnRow = {
  id: string;
  description: string;
  amount: number;
  posted_at: string;
  type: string;
  account_id: string;
  account_kind: string;
  currency: string;
  category_id: string | null;
  installment_number: number | null;
  installment_plan_id: string | null;
  classification_method: string | null;
  classification_confidence: number | null;
  needs_review: boolean;
};

type ReviewRow = AiTransaction & { keep: boolean };

type InstallmentPlanRow = {
  id: string;
  description_normalized: string;
  total_installments: number;
  installment_amount: number;
  current_installment_paid: number;
  status: string;
};

type InstallmentResolution = {
  rowIdx: number;
  descriptionNormalized: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  date: string;
  candidates: InstallmentPlanRow[];
  /** 'new' = create a new plan; a plan id = link to existing; 'skip' = ignore */
  choice: "new" | "skip" | string;
};

// ── Installment pattern parser ─────────────────────────────────────────────
// Handles "PARC 03/08", "PAR 03/08", "PAR03/08" etc.
const INSTALLMENT_RE = /\bPAR[C]?\s*(\d{1,2})\/(\d{1,2})\b/i;

function parseInstallment(description: string) {
  const m = INSTALLMENT_RE.exec(description);
  if (!m) return null;
  const n = parseInt(m[1]);
  const total = parseInt(m[2]);
  if (!Number.isFinite(n) || !Number.isFinite(total) || n < 1 || total < n) return null;
  const normalized = description
    .replace(INSTALLMENT_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { installmentNumber: n, totalInstallments: total, normalized };
}

// ── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  head: () => ({ meta: [{ title: "Calcum — Importar Extrato" }] }),
  component: Index,
});

// ── Component ──────────────────────────────────────────────────────────────

function Index() {
  const navigate = useNavigate();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");

  // OFX
  const [ofxStatus, setOfxStatus] = useState<"idle" | "parsing" | "saving" | "done" | "error">(
    "idle",
  );
  const [ofxMessage, setOfxMessage] = useState("");
  const ofxRef = useRef<HTMLInputElement>(null);

  // PDF phases
  const [pdfPhase, setPdfPhase] = useState<
    | "idle"
    | "extracting"
    | "asking"
    | "analyzing"
    | "validating"
    | "review"
    | "installment_review"
    | "saving"
    | "done"
    | "error"
  >("idle");
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfFilename, setPdfFilename] = useState("");
  const [pdfText, setPdfText] = useState("");
  const [declaredTotal, setDeclaredTotal] = useState("");
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [extractedTotal, setExtractedTotal] = useState(0);
  const [estimatedLineCount, setEstimatedLineCount] = useState(0);
  const [installmentResolutions, setInstallmentResolutions] = useState<InstallmentResolution[]>([]);
  const pdfRef = useRef<HTMLInputElement>(null);

  // Transaction list + filter
  const [transactions, setTransactions] = useState<TxnRow[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [futureBalance, setFutureBalance] = useState<number | null>(null);

  // Categories + classification
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [classifyStatus, setClassifyStatus] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────

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
      const cats = await ensureDefaultCategories(org);
      setCategories(cats);
      await loadTransactions(org);
    }
    init();
  }, [navigate]);

  async function loadTransactions(org: string) {
    const { data } = await supabase
      .from("transactions")
      .select(
        "id, description, amount, posted_at, type, account_id, account_kind, currency, category_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review",
      )
      .eq("organization_id", org)
      .order("posted_at", { ascending: false })
      .limit(500);
    if (data) setTransactions(data as TxnRow[]);
  }

  // ── Future installments balance (for credit card summary) ──────────────

  useEffect(() => {
    if (!orgId || selectedAccount === "all") {
      setFutureBalance(null);
      return;
    }
    const kind = transactions.find((t) => t.account_id === selectedAccount)?.account_kind;
    if (kind !== "credit_card") {
      setFutureBalance(null);
      return;
    }

    supabase
      .from("installment_plans")
      .select("installment_amount, total_installments, current_installment_paid")
      .eq("organization_id", orgId)
      .eq("account_id", selectedAccount)
      .eq("status", "ativo")
      .then(({ data }) => {
        if (!data) return;
        const bal = data.reduce(
          (s, p) => s + p.installment_amount * (p.total_installments - p.current_installment_paid),
          0,
        );
        setFutureBalance(bal);
      });
  }, [orgId, selectedAccount, transactions]);

  // ── Auth / sign-out ────────────────────────────────────────────────────

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  // ── OFX upload ─────────────────────────────────────────────────────────

  async function handleOfxFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!orgId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (ofxRef.current) ofxRef.current.value = "";
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
    let newCount = 0;
    try {
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
      }

      const totalParsed = doc.statements.reduce((n, s) => n + s.transactions.length, 0);
      const dupes = totalParsed - newCount;
      const uncertainDates = doc.statements.reduce(
        (n, s) => n + s.transactions.filter((t) => t.dateInvalid).length,
        0,
      );
      setOfxMessage(
        `✓ ${doc.statements.length} extrato(s) — ${newCount} transação(ões) novas` +
          (dupes > 0 ? ` (${dupes} duplicada(s) ignorada(s))` : "") +
          (uncertainDates > 0 ? ` — ⚠ ${uncertainDates} com data incerta` : ""),
      );
      setOfxStatus("done");
      await loadTransactions(orgId);
      setClassifyStatus("Iniciando classificação…");
      const { classified, needsReview } = await runClassificationPipeline(
        orgId,
        categories,
        setClassifyStatus,
      );
      setClassifyStatus(
        `✓ ${classified} classificadas · ${needsReview > 0 ? `${needsReview} para revisão` : "todas com categoria"}`,
      );
      await loadTransactions(orgId);
    } catch (err) {
      setOfxMessage(err instanceof Error ? err.message : String(err));
      setOfxStatus("error");
    }
  }

  // ── PDF upload ─────────────────────────────────────────────────────────

  async function handlePdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (pdfRef.current) pdfRef.current.value = "";

    setPdfMessage("");
    setPdfFilename(file.name);
    setPdfPhase("extracting");
    setPdfText("");
    setDeclaredTotal("");
    setReviewRows([]);
    setInstallmentResolutions([]);
    setEstimatedLineCount(0);

    try {
      const { extractPdfText } = await import("@/lib/pdf/extract-text");
      const text = await extractPdfText(await file.arrayBuffer());
      setPdfText(text);
      setPdfPhase("asking");
    } catch (err) {
      setPdfMessage(`Erro ao ler PDF: ${err instanceof Error ? err.message : String(err)}`);
      setPdfPhase("error");
    }
  }

  async function handleAnalyze() {
    const total = parseFloat(declaredTotal.replace(",", "."));
    if (!Number.isFinite(total) || total <= 0) {
      setPdfMessage("Digite o valor total da fatura (ex: 1234,56).");
      return;
    }
    setPdfMessage("");
    setPdfPhase("analyzing");

    // Estimate line count from full text client-side (fast regex, no AI needed)
    const lineCount = (pdfText.match(/\b\d{2}\/\d{2}\b.{2,80}?\b\d+[.,]\d{2}\b/gm) ?? []).length;
    setEstimatedLineCount(lineCount);

    const batches = splitTextIntoBatches(pdfText);

    const allTransactions: AiTransaction[] = [];
    let declaredFuture: number | null = null;
    const failedBatches: number[] = [];

    for (let i = 0; i < batches.length; i++) {
      if (batches.length > 1) {
        setPdfMessage(`Analisando seção ${i + 1} de ${batches.length}…`);
      }
      try {
        const result = await extractBatchFn({
          data: {
            batchText: batches[i],
            filename: pdfFilename,
            batchIndex: i,
            totalBatches: batches.length,
          },
        });
        allTransactions.push(...result.transactions);
        if (result.declared_future_installments != null && declaredFuture === null) {
          declaredFuture = result.declared_future_installments;
        }
        if (result.stopped_early) {
          // Batch was truncated by max_tokens — flag it but keep what came back
          failedBatches.push(i + 1);
        }
      } catch (err) {
        console.error(`[PDF] lote ${i + 1} falhou:`, err);
        failedBatches.push(i + 1);
      }
    }

    setPdfPhase("validating");
    const extracted = allTransactions.reduce((s, t) => (t.amount > 0 ? s + t.amount : s), 0);
    setExtractedTotal(extracted);
    setReviewRows(allTransactions.map((t) => ({ ...t, keep: true })));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    if (failedBatches.length > 0) {
      setPdfMessage(
        `⚠ Seção(ões) ${failedBatches.join(", ")} não processadas corretamente — revise as transações antes de importar.`,
      );
    }
    setPdfPhase("review");
  }

  // ── Installment review ─────────────────────────────────────────────────

  async function handlePrepareImport() {
    if (!orgId) return;
    const kept = reviewRows.filter((r) => r.keep);
    if (kept.length === 0) {
      setPdfMessage("Nenhuma transação selecionada.");
      return;
    }

    // Detect installment transactions
    const resolutions: InstallmentResolution[] = [];
    for (let i = 0; i < kept.length; i++) {
      const row = kept[i];
      // Use AI fields if present, otherwise parse locally
      const aiN = row.installment_number ?? null;
      const aiTotal = row.total_installments ?? null;
      const parsed = parseInstallment(row.description);
      const installmentNumber = aiN ?? parsed?.installmentNumber ?? null;
      const totalInstallments = aiTotal ?? parsed?.totalInstallments ?? null;

      if (!installmentNumber || !totalInstallments) continue;

      const normalized =
        parsed?.normalized ??
        row.description
          .replace(INSTALLMENT_RE, "")
          .replace(/\s{2,}/g, " ")
          .trim();

      // Query for candidate plans
      const { data: candidates } = await supabase
        .from("installment_plans")
        .select(
          "id, description_normalized, total_installments, installment_amount, current_installment_paid, status",
        )
        .eq("organization_id", orgId)
        .eq("account_id", "pdf-manual")
        .eq("status", "ativo")
        .ilike("description_normalized", `%${normalized.slice(0, 30)}%`);

      resolutions.push({
        rowIdx: reviewRows.indexOf(row),
        descriptionNormalized: normalized,
        installmentNumber,
        totalInstallments,
        amount: row.amount,
        date: row.date,
        candidates: (candidates ?? []) as InstallmentPlanRow[],
        choice: candidates && candidates.length === 1 ? candidates[0].id : "new",
      });
    }

    const needsConfirmation = resolutions.some((r) => r.candidates.length > 0);

    if (needsConfirmation) {
      setInstallmentResolutions(resolutions);
      setPdfPhase("installment_review");
    } else {
      setInstallmentResolutions(resolutions);
      await handleSaveWithInstallments(resolutions);
    }
  }

  async function handleSaveWithInstallments(resolutions: InstallmentResolution[]) {
    if (!orgId) return;
    const kept = reviewRows.filter((r) => r.keep);

    setPdfPhase("saving");
    setPdfMessage("");

    const total = parseFloat(declaredTotal.replace(",", "."));
    const delta = Math.abs(extractedTotal - total);
    const requiresReview = delta > 0.01;

    // Build a map: rowIdx → {planId, installmentNumber}
    const planMap = new Map<number, { planId: string; installmentNumber: number }>();

    try {
      // Create / update installment plans
      for (const res of resolutions) {
        if (res.choice === "skip") continue;

        let planId: string;

        if (res.choice === "new") {
          // Create a new plan
          const { data: newPlan, error: planErr } = await supabase
            .from("installment_plans")
            .insert({
              organization_id: orgId,
              account_id: "pdf-manual",
              description_normalized: res.descriptionNormalized,
              total_installments: res.totalInstallments,
              installment_amount: res.amount,
              current_installment_paid: res.installmentNumber,
              status: res.installmentNumber >= res.totalInstallments ? "concluido" : "ativo",
            })
            .select("id")
            .single();
          if (planErr) throw new Error(`installment_plans: ${planErr.message}`);
          planId = newPlan.id;
        } else {
          // Link to existing plan and increment paid count
          planId = res.choice;
          const newPaid = res.installmentNumber;
          const { error: updErr } = await supabase
            .from("installment_plans")
            .update({
              current_installment_paid: newPaid,
              status: newPaid >= res.totalInstallments ? "concluido" : "ativo",
              updated_at: new Date().toISOString(),
            })
            .eq("id", planId);
          if (updErr) throw new Error(`installment_plans update: ${updErr.message}`);
        }

        planMap.set(res.rowIdx, { planId, installmentNumber: res.installmentNumber });
      }

      // Save the statement_import
      const { data: imp, error: impErr } = await supabase
        .from("statement_imports")
        .insert({
          organization_id: orgId,
          filename: pdfFilename,
          account_id: "pdf-manual",
          account_kind: "credit_card",
          currency: "BRL",
          transaction_count: kept.length,
          status: "completed",
          source: "pdf_manual",
          declared_total: total,
          extracted_total: extractedTotal,
          requires_review: requiresReview,
        })
        .select("id")
        .single();

      if (impErr) throw new Error(`statement_imports: ${impErr.message}`);

      // Build transaction rows with installment linkage
      const rows = kept.map((t) => {
        const originalIdx = reviewRows.indexOf(t);
        const plan = planMap.get(originalIdx);
        return {
          organization_id: orgId,
          statement_import_id: imp.id,
          amount: -t.amount,
          description: t.description,
          posted_at: new Date(t.date).toISOString(),
          fit_id: `PDF-${pdfFilename}-${t.date}-${Math.abs(t.amount)}-${t.description}`.slice(
            0,
            255,
          ),
          type: t.amount > 0 ? "DEBIT" : "CREDIT",
          account_id: "pdf-manual",
          account_kind: "credit_card",
          currency: "BRL",
          category_id: null,
          extraction_confidence: t.confidence,
          extraction_source_excerpt: t.source_excerpt ?? null,
          installment_plan_id: plan?.planId ?? null,
          installment_number: plan?.installmentNumber ?? null,
        };
      });

      const { count, error: txErr } = await supabase.from("transactions").upsert(rows, {
        onConflict: "organization_id,account_id,fit_id",
        ignoreDuplicates: true,
        count: "exact",
      });

      if (txErr) throw new Error(`transactions: ${txErr.message}`);

      const avgConf = kept.reduce((s, r) => s + r.confidence, 0) / kept.length;
      const confLabel =
        avgConf >= 0.9
          ? "alta confiança"
          : avgConf >= 0.7
            ? "confiança média"
            : "baixa confiança — revise";
      const newPlans = resolutions.filter((r) => r.choice === "new").length;
      const linkedPlans = resolutions.filter(
        (r) => r.choice !== "new" && r.choice !== "skip",
      ).length;

      setPdfMessage(
        `✓ ${count ?? kept.length} transação(ões) importadas (${confLabel})` +
          (newPlans > 0 ? ` · ${newPlans} plano(s) de parcelamento criado(s)` : "") +
          (linkedPlans > 0 ? ` · ${linkedPlans} vinculado(s) a planos existentes` : "") +
          (requiresReview
            ? ` — ⚠ total extraído R$ ${extractedTotal.toFixed(2)} difere do declarado R$ ${total.toFixed(2)}`
            : ""),
      );
      setPdfPhase("done");
      await loadTransactions(orgId);
      setClassifyStatus("Iniciando classificação…");
      const { classified, needsReview } = await runClassificationPipeline(
        orgId,
        categories,
        setClassifyStatus,
      );
      setClassifyStatus(
        `✓ ${classified} classificadas · ${needsReview > 0 ? `${needsReview} para revisão` : "todas com categoria"}`,
      );
      await loadTransactions(orgId);
    } catch (err) {
      setPdfMessage(err instanceof Error ? err.message : String(err));
      setPdfPhase("error");
    }
  }

  function resetPdf() {
    setPdfPhase("idle");
    setPdfMessage("");
    setPdfFilename("");
    setPdfText("");
    setDeclaredTotal("");
    setReviewRows([]);
    setExtractedTotal(0);
    setEstimatedLineCount(0);
    setInstallmentResolutions([]);
  }

  // ── Classify all pending transactions ─────────────────────────────────

  async function handleClassifyPending() {
    if (!orgId || classifying) return;
    setClassifying(true);
    setClassifyStatus("Buscando transações sem categoria…");
    try {
      const { classified, needsReview } = await runClassificationPipeline(
        orgId,
        categories,
        setClassifyStatus,
      );
      setClassifyStatus(
        `✓ ${classified} classificadas · ${needsReview > 0 ? `${needsReview} para revisão` : "todas com categoria"}`,
      );
      await loadTransactions(orgId);
    } catch (err) {
      setClassifyStatus(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setClassifying(false);
    }
  }

  // ── Manual category confirmation ───────────────────────────────────────

  async function handleCategoryChange(txn: TxnRow, categoryId: string) {
    setEditingCategoryFor(null);
    if (!orgId) return;
    await learnFromConfirmation(orgId, txn.id, txn.description, categoryId);
    await loadTransactions(orgId);
  }

  // ── Derived ────────────────────────────────────────────────────────────

  type AccountOption = { accountId: string; accountKind: string };
  const accounts = Array.from(
    new Map(
      transactions.map((t) => [
        `${t.account_id}|${t.account_kind}`,
        { accountId: t.account_id, accountKind: t.account_kind },
      ]),
    ).values(),
  ) as AccountOption[];

  const selectedAccountKind =
    selectedAccount === "all"
      ? null
      : (accounts.find((a) => a.accountId === selectedAccount)?.accountKind ?? null);

  const displayedTransactions =
    selectedAccount === "all"
      ? transactions
      : transactions.filter((t) => t.account_id === selectedAccount);

  // Generic totals (used for checking / all accounts)
  const entradas = displayedTransactions.reduce((s, t) => (t.amount > 0 ? s + t.amount : s), 0);
  const saidas = displayedTransactions.reduce(
    (s, t) => (t.amount < 0 ? s + Math.abs(t.amount) : s),
    0,
  );
  const saldo = entradas - saidas;

  // Credit-card-specific totals
  const cashPurchases = displayedTransactions
    .filter((t) => t.amount < 0 && t.installment_number === null)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const installmentCharges = displayedTransactions
    .filter((t) => t.amount < 0 && t.installment_number !== null)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  // Line-count mismatch warning (>15% fewer transactions than estimated)
  const lineMismatch = estimatedLineCount > 5 && reviewRows.length < estimatedLineCount * 0.85;

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!orgId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ color: "#9ca3af" }}>Carregando…</p>
      </div>
    );
  }

  const ofxBusy = ofxStatus === "parsing" || ofxStatus === "saving";
  const pdfBusy =
    pdfPhase === "extracting" ||
    pdfPhase === "analyzing" ||
    pdfPhase === "validating" ||
    pdfPhase === "saving";

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.h1}>Calcum — Importar Extrato</h1>
        <div style={s.userBar}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>{userEmail}</span>
          <button onClick={handleSignOut} style={s.signOutBtn}>
            Sair
          </button>
        </div>
      </div>

      {/* Import toolbar */}
      <div style={s.toolbar}>
        {/* OFX */}
        <label
          style={{
            ...s.uploadBtn,
            opacity: ofxBusy ? 0.5 : 1,
            cursor: ofxBusy ? "not-allowed" : "pointer",
          }}
        >
          {ofxBusy ? (ofxStatus === "parsing" ? "Processando OFX…" : "Salvando…") : "Importar OFX"}
          <input
            ref={ofxRef}
            type="file"
            accept=".ofx,.OFX"
            style={{ display: "none" }}
            onChange={handleOfxFile}
            disabled={ofxBusy}
          />
        </label>
        {ofxMessage && (
          <span style={{ color: ofxStatus === "error" ? "#dc2626" : "#16a34a", fontSize: 13 }}>
            {ofxMessage}
          </span>
        )}

        <span style={{ color: "#d1d5db", fontSize: 18 }}>|</span>

        {/* PDF */}
        {(pdfPhase === "idle" || pdfPhase === "done" || pdfPhase === "error") && (
          <label style={{ ...s.uploadBtn, background: "#7c3aed", cursor: "pointer" }}>
            Importar Fatura PDF
            <input
              ref={pdfRef}
              type="file"
              accept=".pdf,.PDF"
              style={{ display: "none" }}
              onChange={handlePdfFile}
            />
          </label>
        )}
        {pdfBusy && (
          <span style={s.pdfSpinner}>
            <Loader2 size={15} className="animate-spin" />
            {pdfPhase === "extracting" && "Lendo o arquivo PDF…"}
            {pdfPhase === "analyzing" && "Analisando as transações com IA…"}
            {pdfPhase === "validating" && "Validando os valores…"}
            {pdfPhase === "saving" && "Salvando transações…"}
          </span>
        )}
        {pdfMessage && (
          <span
            style={{
              color: pdfPhase === "error" ? "#dc2626" : "#7c3aed",
              fontSize: 13,
              maxWidth: 500,
            }}
          >
            {pdfMessage}
          </span>
        )}

        <span style={{ color: "#d1d5db", fontSize: 18 }}>|</span>

        {/* Classify pending */}
        <button
          onClick={handleClassifyPending}
          disabled={classifying}
          style={{
            ...s.uploadBtn,
            background: "#059669",
            opacity: classifying ? 0.5 : 1,
            cursor: classifying ? "not-allowed" : "pointer",
            border: "none",
          }}
        >
          {classifying ? (
            <>
              <Loader2
                size={13}
                className="animate-spin"
                style={{ display: "inline", marginRight: 6 }}
              />
              Classificando…
            </>
          ) : (
            "Classificar pendentes"
          )}
        </button>
      </div>

      {/* PDF: ask for declared total */}
      {pdfPhase === "asking" && (
        <div style={s.card}>
          <p style={s.cardTitle}>
            Fatura: <strong>{pdfFilename}</strong>
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Texto extraído: {pdfText.length.toLocaleString("pt-BR")} caracteres
          </p>
          <label style={s.label}>
            Total da fatura (R$)
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 1.234,56"
              value={declaredTotal}
              onChange={(e) => setDeclaredTotal(e.target.value)}
              style={s.input}
              autoFocus
            />
          </label>
          {pdfMessage && <p style={{ color: "#dc2626", fontSize: 13 }}>{pdfMessage}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleAnalyze} style={s.btnPurple}>
              Analisar com IA
            </button>
            <button onClick={resetPdf} style={s.btnGhost}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* PDF: review screen */}
      {pdfPhase === "review" && (
        <div style={s.card}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <p style={s.cardTitle}>
              Revisar transações — <strong>{pdfFilename}</strong>
            </p>
            <TotalBadge
              declared={parseFloat(declaredTotal.replace(",", "."))}
              extracted={extractedTotal}
            />
          </div>

          {/* Line count mismatch warning */}
          {lineMismatch && (
            <div
              style={{
                background: "#fef3c7",
                border: "1px solid #fcd34d",
                borderRadius: 6,
                padding: "8px 12px",
                marginBottom: 12,
                fontSize: 13,
                color: "#92400e",
              }}
            >
              ⚠ Possível extração incompleta: a IA extraiu {reviewRows.length} transações, mas o
              texto sugere aproximadamente {estimatedLineCount} linhas de lançamento. Verifique se
              todas as seções da fatura foram incluídas.
            </div>
          )}

          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={s.table}>
              <thead>
                <tr style={{ background: "#f5f3ff" }}>
                  <th style={s.th}>
                    <input
                      type="checkbox"
                      checked={reviewRows.every((r) => r.keep)}
                      onChange={(e) =>
                        setReviewRows((rows) => rows.map((r) => ({ ...r, keep: e.target.checked })))
                      }
                    />
                  </th>
                  <th style={s.th}>Data</th>
                  <th style={s.th}>Descrição</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Valor (R$)</th>
                  <th style={s.th}>Parcela</th>
                  <th style={s.th}>Conf.</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((row, i) => {
                  const inst =
                    row.installment_number && row.total_installments
                      ? `${row.installment_number}/${row.total_installments}`
                      : null;
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: "1px solid #e5e7eb", opacity: row.keep ? 1 : 0.4 }}
                    >
                      <td style={s.td}>
                        <input
                          type="checkbox"
                          checked={row.keep}
                          onChange={(e) =>
                            setReviewRows((rows) =>
                              rows.map((r, j) => (j === i ? { ...r, keep: e.target.checked } : r)),
                            )
                          }
                        />
                      </td>
                      <td style={s.td}>
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) =>
                            setReviewRows((rows) =>
                              rows.map((r, j) => (j === i ? { ...r, date: e.target.value } : r)),
                            )
                          }
                          style={{ ...s.inlineInput, width: 130 }}
                        />
                      </td>
                      <td style={{ ...s.td, ...s.descCell }}>
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) =>
                            setReviewRows((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, description: e.target.value } : r,
                              ),
                            )
                          }
                          style={{ ...s.inlineInput, width: "100%", minWidth: 180 }}
                          title={row.source_excerpt}
                        />
                      </td>
                      <td style={{ ...s.td, textAlign: "right" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) =>
                            setReviewRows((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, amount: parseFloat(e.target.value) || 0 } : r,
                              ),
                            )
                          }
                          style={{
                            ...s.inlineInput,
                            width: 100,
                            textAlign: "right",
                            color: row.amount > 0 ? "#dc2626" : "#16a34a",
                          }}
                        />
                      </td>
                      <td style={{ ...s.td, color: "#7c3aed", fontSize: 12, fontWeight: 600 }}>
                        {inst ?? "—"}
                      </td>
                      <td style={s.td}>
                        <ConfidenceBadge value={row.confidence} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handlePrepareImport} style={s.btnPurple}>
              Confirmar importação ({reviewRows.filter((r) => r.keep).length})
            </button>
            <button onClick={resetPdf} style={s.btnGhost}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* PDF: installment review */}
      {pdfPhase === "installment_review" && (
        <div style={s.card}>
          <p style={s.cardTitle}>
            Revisão de parcelamentos — <strong>{pdfFilename}</strong>
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            {installmentResolutions.length} transação(ões) parcelada(s) identificada(s). Confirme os
            vínculos antes de salvar.
          </p>

          {/* Auto-create (no candidates) */}
          {installmentResolutions.filter((r) => r.candidates.length === 0).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                Novos planos de parcelamento (criados automaticamente):
              </p>
              {installmentResolutions
                .filter((r) => r.candidates.length === 0)
                .map((r, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: 6,
                      padding: "8px 12px",
                      marginBottom: 6,
                      fontSize: 13,
                    }}
                  >
                    ✓ <strong>{r.descriptionNormalized}</strong> — parcela {r.installmentNumber}/
                    {r.totalInstallments} · R$ {r.amount.toFixed(2)}
                  </div>
                ))}
            </div>
          )}

          {/* Confirmation required */}
          {installmentResolutions
            .filter((r) => r.candidates.length > 0)
            .map((r, i) => (
              <div
                key={i}
                style={{
                  background: "#faf5ff",
                  border: "1px solid #e9d5ff",
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Nova parcela: <strong>{r.descriptionNormalized}</strong> — parcela{" "}
                  {r.installmentNumber}/{r.totalInstallments} · R$ {r.amount.toFixed(2)}
                </p>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                  Encontramos {r.candidates.length} plano(s) existente(s) com descrição similar.
                  Este é uma continuação de um deles?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {r.candidates.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={`inst-${i}`}
                        checked={installmentResolutions.find((x) => x === r)?.choice === c.id}
                        onChange={() =>
                          setInstallmentResolutions((prev) =>
                            prev.map((x) => (x === r ? { ...x, choice: c.id } : x)),
                          )
                        }
                      />
                      <span>
                        Vincular a: <strong>{c.description_normalized}</strong> (pago{" "}
                        {c.current_installment_paid}/{c.total_installments} · R${" "}
                        {Number(c.installment_amount).toFixed(2)}/parcela)
                      </span>
                    </label>
                  ))}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name={`inst-${i}`}
                      checked={installmentResolutions.find((x) => x === r)?.choice === "new"}
                      onChange={() =>
                        setInstallmentResolutions((prev) =>
                          prev.map((x) => (x === r ? { ...x, choice: "new" } : x)),
                        )
                      }
                    />
                    <span>Criar novo plano de parcelamento</span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name={`inst-${i}`}
                      checked={installmentResolutions.find((x) => x === r)?.choice === "skip"}
                      onChange={() =>
                        setInstallmentResolutions((prev) =>
                          prev.map((x) => (x === r ? { ...x, choice: "skip" } : x)),
                        )
                      }
                    />
                    <span>Ignorar (não vincular a nenhum plano)</span>
                  </label>
                </div>
              </div>
            ))}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => handleSaveWithInstallments(installmentResolutions)}
              style={s.btnPurple}
            >
              Confirmar e salvar
            </button>
            <button onClick={() => setPdfPhase("review")} style={s.btnGhost}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* Account filter + summary */}
      {transactions.length > 0 && (
        <div style={s.filterBar}>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger style={s.selectTrigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={`${a.accountId}|${a.accountKind}`} value={a.accountId}>
                  {accountLabel(a.accountId, a.accountKind)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div style={s.totalsBar}>
            {selectedAccountKind === "credit_card" ? (
              <>
                <TotalChip label="À vista" amount={cashPurchases} color="#dc2626" />
                <TotalChip label="Parcelas" amount={installmentCharges} color="#7c3aed" />
                <TotalChip
                  label="Total fatura"
                  amount={cashPurchases + installmentCharges}
                  color="#111827"
                />
                {futureBalance !== null && (
                  <TotalChip label="Futuras" amount={futureBalance} color="#d97706" />
                )}
              </>
            ) : (
              <>
                <TotalChip label="Entradas" amount={entradas} color="#16a34a" />
                <TotalChip label="Saídas" amount={saidas} color="#dc2626" />
                <TotalChip
                  label="Saldo"
                  amount={saldo}
                  color={saldo >= 0 ? "#2563eb" : "#dc2626"}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Classification status bar */}
      {classifyStatus && (
        <p
          style={{
            fontSize: 13,
            color: classifyStatus.startsWith("✓") ? "#16a34a" : "#6b7280",
            margin: "8px 0 0",
          }}
        >
          {classifyStatus}
        </p>
      )}

      {/* Transactions list */}
      <div style={{ marginTop: 16 }}>
        {transactions.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 14 }}>
            Nenhuma transação ainda. Importe um OFX ou fatura PDF para começar.
          </p>
        ) : (
          <>
            <p style={s.count}>{displayedTransactions.length} transação(ões) exibidas</p>
            <div style={{ overflowX: "auto" }}>
              <table style={s.table}>
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    <th style={s.th}>Data</th>
                    <th style={s.th}>Descrição</th>
                    <th style={s.th}>Tipo</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Valor</th>
                    <th style={s.th}>Conta</th>
                    <th style={s.th}>Modalidade</th>
                    <th style={s.th}>Parcela</th>
                    <th style={s.th}>Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTransactions.map((t) => {
                    const catName = categories.find((c) => c.id === t.category_id)?.name;
                    const isEditing = editingCategoryFor === t.id;
                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: "1px solid #e5e7eb",
                          background: t.needs_review ? "#fefce8" : "transparent",
                        }}
                      >
                        <td style={s.td}>{new Date(t.posted_at).toLocaleDateString("pt-BR")}</td>
                        <td style={{ ...s.td, ...s.descCell }}>{t.description || "—"}</td>
                        <td style={{ ...s.td, color: "#6b7280" }}>{t.type}</td>
                        <td
                          style={{
                            ...s.td,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            color: t.amount < 0 ? "#dc2626" : "#16a34a",
                          }}
                        >
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: t.currency || "BRL",
                          }).format(t.amount)}
                        </td>
                        <td style={{ ...s.td, color: "#6b7280", fontSize: 12 }}>{t.account_id}</td>
                        <td style={s.td}>{accountKindLabel[t.account_kind] ?? t.account_kind}</td>
                        <td style={{ ...s.td, color: "#7c3aed", fontSize: 12 }}>
                          {t.installment_number ?? "—"}
                        </td>
                        <td style={s.td}>
                          {isEditing ? (
                            <select
                              autoFocus
                              style={s.inlineInput}
                              defaultValue={t.category_id ?? ""}
                              onBlur={() => setEditingCategoryFor(null)}
                              onChange={(e) => {
                                if (e.target.value) handleCategoryChange(t, e.target.value);
                              }}
                            >
                              <option value="">— sem categoria —</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button
                              onClick={() => setEditingCategoryFor(t.id)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "2px 4px",
                                borderRadius: 4,
                                fontSize: 12,
                                color: t.needs_review ? "#b45309" : catName ? "#374151" : "#9ca3af",
                                textDecoration: t.needs_review ? "underline dotted" : "none",
                              }}
                              title={
                                t.needs_review
                                  ? "Revisão necessária — clique para classificar"
                                  : "Clique para alterar"
                              }
                            >
                              {t.needs_review && "⚠ "}
                              {catName ?? "—"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.9 ? "#16a34a" : value >= 0.7 ? "#d97706" : "#dc2626";
  return <span style={{ fontSize: 12, fontWeight: 600, color }}>{pct}%</span>;
}

function TotalBadge({ declared, extracted }: { declared: number; extracted: number }) {
  const delta = Math.abs(extracted - declared);
  const ok = delta <= 0.01;
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  return (
    <div
      style={{
        fontSize: 13,
        padding: "4px 10px",
        borderRadius: 6,
        background: ok ? "#dcfce7" : "#fef3c7",
        color: ok ? "#166534" : "#92400e",
      }}
    >
      {ok
        ? `✓ Total confere: ${fmt(declared)}`
        : `Declarado: ${fmt(declared)} · Extraído: ${fmt(extracted)} · Diferença: ${fmt(delta)}`}
    </div>
  );
}

function accountLabel(accountId: string, accountKind: string): string {
  const kind = accountKindLabel[accountKind] ?? accountKind;
  const suffix = accountId.length > 4 ? `•••${accountId.slice(-4)}` : accountId;
  return `${kind} ${suffix}`;
}

function TotalChip({ label, amount, color }: { label: string; amount: number; color: string }) {
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <span
        style={{
          fontSize: 11,
          color: "#6b7280",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {fmt.format(amount)}
      </span>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const accountKindLabel: Record<string, string> = {
  checking: "Conta corrente",
  credit_card: "Cartão de crédito",
  investment: "Investimento",
};

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    maxWidth: 1280,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#111827",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  userBar: { display: "flex", alignItems: "center", gap: 12 },
  signOutBtn: {
    padding: "6px 14px",
    background: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    color: "#374151",
  },
  toolbar: { display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  uploadBtn: {
    display: "inline-block",
    padding: "8px 18px",
    background: "#2563eb",
    color: "#fff",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    userSelect: "none",
  },
  pdfSpinner: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#7c3aed",
    fontWeight: 500,
  },
  card: {
    background: "#faf5ff",
    border: "1px solid #e9d5ff",
    borderRadius: 8,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, margin: "0 0 8px" },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 8,
  },
  input: { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 },
  inlineInput: {
    padding: "3px 6px",
    border: "1px solid #e5e7eb",
    borderRadius: 4,
    fontSize: 12,
    background: "transparent",
  },
  btnPurple: {
    padding: "8px 18px",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    padding: "8px 14px",
    background: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
    color: "#374151",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: "1px solid #e5e7eb",
  },
  selectTrigger: { width: 260, fontSize: 13 },
  totalsBar: { display: "flex", gap: 32, alignItems: "flex-end" },
  count: { fontSize: 13, color: "#6b7280", marginBottom: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "8px 12px",
    textAlign: "left" as const,
    fontWeight: 600,
    borderBottom: "2px solid #e5e7eb",
    whiteSpace: "nowrap" as const,
  },
  td: { padding: "6px 12px" },
  descCell: { maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
};
