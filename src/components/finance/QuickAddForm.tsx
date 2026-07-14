import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mic, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { transcribeAudioFn, type TranscriptionResult } from "@/lib/ai/transcribe-audio";
import { extractVoiceTextFn, type PaymentMethodHint } from "@/lib/ai/voice-entry";
import { matchPaymentAccount } from "@/lib/finance/account-match";
import { suggestCategoryForDescription } from "@/lib/classification/suggest";
import { categoryPath, leafCategoryOptions } from "@/lib/finance/categories";
import { ensureAccountFromTransaction } from "@/lib/finance/data";
import { computeInstallmentSchedule } from "@/lib/finance/installments";
import type { AccountRow, CategoryRow } from "@/lib/finance/types";
import { supabase } from "@/lib/supabase/client";

const schema = z.object({
  transaction_type: z.enum(["expense", "income", "transfer"]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().min(2, "Descreva o lançamento"),
  category_id: z.string().optional(),
  posted_at: z.string().min(10),
  account_id: z.string().min(1, "Selecione a conta ou cartão utilizado"),
  account_kind: z.enum(["checking", "credit_card", "investment"]),
  installments_count: z.coerce.number().int().min(1).max(60),
  original_text: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  orgId: string;
  userId: string | null;
  categories: CategoryRow[];
  accounts: AccountRow[];
  /** Focus the voice/text field on mount — used when opened from the mobile FAB sheet. */
  autoFocusInput?: boolean;
  /** Called after a successful save — used by the FAB sheet to close itself. */
  onSaved?: () => void;
  /** Skip the outer Card chrome when embedded in another container (e.g. a Drawer). */
  bare?: boolean;
};

type PendingAudio = {
  audioBase64: string;
  mimeType: string;
  durationMs: number;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type ProcessingStage = "idle" | "transcribing" | "interpreting";

const PROCESSING_LABEL: Record<Exclude<ProcessingStage, "idle">, string> = {
  transcribing: "Transcrevendo áudio…",
  interpreting: "Interpretando lançamento…",
};

export function QuickAddForm({
  orgId,
  userId,
  categories,
  accounts,
  autoFocusInput,
  onSaved,
  bare,
}: Props) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>("idle");
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const categoryItems = leafCategoryOptions(categories);
  const myAccounts = accounts.filter((account) => account.owner_user_id === userId);
  const householdAccounts = accounts.filter((account) => account.owner_user_id !== userId);
  const orderedAccounts = [...myAccounts, ...householdAccounts];

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      transaction_type: "expense",
      amount: 0,
      description: "",
      category_id: "",
      posted_at: today(),
      account_id: orderedAccounts[0]?.account_key ?? "manual-cash",
      account_kind: orderedAccounts[0]?.kind ?? "checking",
      installments_count: 1,
      original_text: "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const signedType =
        values.transaction_type === "expense"
          ? "MANUAL_DEBIT"
          : values.transaction_type === "income"
            ? "MANUAL_CREDIT"
            : "MANUAL_TRANSFER";
      const sign = values.transaction_type === "expense" ? -1 : 1;

      if (!accounts.some((account) => account.account_key === values.account_id)) {
        await ensureAccountFromTransaction(
          orgId,
          values.account_id,
          values.account_kind,
          userId ?? undefined,
        );
      }

      const baseRow = {
        organization_id: orgId,
        description: values.description,
        type: signedType,
        account_id: values.account_id,
        account_kind: values.account_kind,
        currency: "BRL",
        created_by: userId,
        category_id: values.category_id || null,
        original_text: values.original_text || null,
        classification_method: values.category_id ? "manual" : null,
        classification_confidence: values.category_id ? 1 : null,
        needs_review: !values.category_id,
      };

      if (values.installments_count > 1) {
        const account = accounts.find((a) => a.account_key === values.account_id);
        const schedule = computeInstallmentSchedule(
          new Date(values.posted_at),
          values.amount,
          values.installments_count,
          account?.closing_day ?? null,
        );
        const { data: plan, error: planError } = await supabase
          .from("installment_plans")
          .insert({
            organization_id: orgId,
            account_id: values.account_id,
            description_normalized: values.description.trim().toLowerCase(),
            total_installments: values.installments_count,
            installment_amount: schedule[0].amount,
            confirmed_by: userId,
          })
          .select("id")
          .single();
        if (planError) throw new Error(planError.message);

        const rows = schedule.map((installment) => ({
          ...baseRow,
          amount: sign * Math.abs(installment.amount),
          posted_at: new Date(installment.postedAt).toISOString(),
          fit_id: `MANUAL-${crypto.randomUUID()}`,
          installment_plan_id: plan.id,
          installment_number: installment.number,
        }));
        const { error } = await supabase.from("transactions").insert(rows);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from("transactions").insert({
        ...baseRow,
        amount: sign * Math.abs(values.amount),
        posted_at: new Date(values.posted_at).toISOString(),
        fit_id: `MANUAL-${crypto.randomUUID()}`,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      form.reset({
        transaction_type: "expense",
        amount: 0,
        description: "",
        category_id: "",
        posted_at: today(),
        account_id: form.getValues("account_id"),
        account_kind: form.getValues("account_kind"),
        installments_count: 1,
        original_text: "",
      });
      setStatus("Lançamento salvo.");
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
      onSaved?.();
    },
    onError: (err) => setStatus(err instanceof Error ? err.message : String(err)),
  });

  async function suggestCategory() {
    const values = form.getValues();
    if (!values.description || !values.amount) return;
    setStatus("Sugerindo categoria…");
    try {
      const suggestion = await suggestCategoryForDescription(
        orgId,
        values.description,
        values.amount,
        values.account_kind,
        categoryItems,
      );
      if (suggestion.category_id) {
        form.setValue("category_id", suggestion.category_id);
        setStatus(`Categoria sugerida: ${categoryPath(categories, suggestion.category_id)}.`);
      } else {
        setStatus("Nenhuma categoria sugerida.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  /** Applies the AI draft's payment-method/account-name hints to the account
   *  fields, or clears the account so the user must pick explicitly when
   *  more than one account of the inferred kind exists. Returns a status
   *  suffix describing what happened, or "" when there was nothing to say. */
  function applyAccountMatch(draft: {
    payment_method_hint: PaymentMethodHint;
    account_hint: string | null;
  }): string {
    const match = matchPaymentAccount(accounts, {
      paymentMethodHint: draft.payment_method_hint,
      accountNameHint: draft.account_hint,
    });
    if (match.status === "resolved") {
      form.setValue("account_id", match.accountId);
      form.setValue("account_kind", match.accountKind);
      return "";
    }
    if (match.status === "ambiguous") {
      form.setValue("account_id", "");
      const kindLabel = match.accountKind === "credit_card" ? "cartão" : "conta";
      return ` Selecione qual ${kindLabel} foi usado.`;
    }
    return "";
  }

  async function interpretNativeText() {
    const text = form.getValues("original_text")?.trim();
    if (!text) return;
    setStatus("Interpretando texto…");
    try {
      const draft = await extractVoiceTextFn({ data: { text } });
      form.setValue("description", draft.description);
      form.setValue("amount", draft.amount);
      form.setValue("transaction_type", draft.transaction_type);
      form.setValue("posted_at", draft.date);
      form.setValue("installments_count", draft.installments_count);
      const accountNote = applyAccountMatch(draft);
      await suggestCategory();
      setStatus(`Confira os campos antes de salvar.${accountNote}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function logTranscriptionUsage(transcription: TranscriptionResult) {
    const { error } = await supabase.from("ai_usage_logs").insert({
      organization_id: orgId,
      provider: "openai",
      operation: "voice_transcription",
      model: transcription.model,
      duration_seconds: transcription.duration_seconds,
      estimated_cost_usd: transcription.estimated_cost_usd,
      metadata: {
        source: "quick_add_voice",
      },
    });
    if (error) {
      setStatus(`Transcrição feita, mas o log de custo não foi salvo: ${error.message}`);
    }
  }

  async function transcribeAndInterpretAudio(audio: PendingAudio) {
    setProcessingStage("transcribing");
    setStatus(PROCESSING_LABEL.transcribing);
    try {
      const transcription = await transcribeAudioFn({ data: audio });
      await logTranscriptionUsage(transcription);
      form.setValue("original_text", transcription.text);

      setProcessingStage("interpreting");
      setStatus(PROCESSING_LABEL.interpreting);
      const draft = await extractVoiceTextFn({ data: { text: transcription.text } });
      form.setValue("description", draft.description);
      form.setValue("amount", draft.amount);
      form.setValue("transaction_type", draft.transaction_type);
      form.setValue("posted_at", draft.date);
      form.setValue("installments_count", draft.installments_count);
      const accountNote = applyAccountMatch(draft);
      setPendingAudio(null);
      await suggestCategory();
      setStatus(`Transcrição interpretada. Confira antes de salvar.${accountNote}`);
    } catch (err) {
      setPendingAudio(audio);
      setStatus(
        `Não consegui transcrever o áudio. Ele ficou pendente para nova tentativa: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setProcessingStage("idle");
    }
  }

  function stopRecordingTimer() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      stopRecordingTimer();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        stopRecordingTimer();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        try {
          const audioBase64 = await fileToBase64(blob);
          const durationMs = recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : 0;
          await transcribeAndInterpretAudio({
            audioBase64,
            mimeType: blob.type || "audio/webm",
            durationMs,
          });
        } catch (err) {
          setStatus(
            `Não consegui preparar o áudio para transcrição. Ele não foi salvo como transação: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      };
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
      setStatus("Gravando…");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  const formContent = (
    <form
      onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
      className="grid gap-4 md:grid-cols-6"
    >
      <div className="md:col-span-6">
        <Label>Texto ditado ou anotação</Label>
        <div className="mt-1 flex items-start gap-2">
          <Textarea
            placeholder="Ex: gastei 42 reais no mercado hoje no cartão"
            autoFocus={autoFocusInput}
            {...form.register("original_text")}
          />
          <div className="flex flex-col items-center gap-1">
            <Button
              type="button"
              variant={recording ? "destructive" : "outline"}
              size="icon"
              disabled={processingStage !== "idle"}
              aria-label={recording ? "Parar gravação" : "Gravar áudio"}
              className={recording ? "animate-pulse" : undefined}
              onClick={toggleRecording}
            >
              {processingStage !== "idle" ? (
                <Loader2 className="animate-spin" />
              ) : recording ? (
                <Square className="fill-current" />
              ) : (
                <Mic />
              )}
            </Button>
            {recording ? (
              <span className="whitespace-nowrap text-xs font-medium text-red-600">
                ● {formatSeconds(recordingSeconds)}
              </span>
            ) : null}
          </div>
        </div>
        {recording ? (
          <p className="mt-1 text-xs text-red-600">Gravando… toque no botão para parar.</p>
        ) : null}
        {processingStage !== "idle" ? (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            {PROCESSING_LABEL[processingStage]}
          </div>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          disabled={processingStage !== "idle"}
          onClick={interpretNativeText}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Interpretar texto
        </Button>
        {pendingAudio ? (
          <Button
            type="button"
            variant="outline"
            className="ml-2 mt-2"
            onClick={() => transcribeAndInterpretAudio(pendingAudio)}
          >
            Tentar transcrição de novo
          </Button>
        ) : null}
      </div>

      <div className="md:col-span-1">
        <Label>Tipo</Label>
        <Select
          value={form.watch("transaction_type")}
          onValueChange={(value) =>
            form.setValue("transaction_type", value as FormValues["transaction_type"])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Despesa</SelectItem>
            <SelectItem value="income">Receita</SelectItem>
            <SelectItem value="transfer">Transferência</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-1">
        <Label>Valor</Label>
        <Input type="number" step="0.01" {...form.register("amount")} />
      </div>
      <div className="md:col-span-2">
        <Label>Descrição</Label>
        <Input {...form.register("description")} onBlur={suggestCategory} />
      </div>
      <div className="md:col-span-1">
        <Label>Data</Label>
        <Input type="date" {...form.register("posted_at")} />
      </div>
      <div className="md:col-span-1">
        <Label>Categoria</Label>
        <Select
          value={form.watch("category_id") || "none"}
          onValueChange={(value) => form.setValue("category_id", value === "none" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem categoria</SelectItem>
            {categoryItems.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label>Conta/cartão</Label>
        <Select
          value={`${form.watch("account_id")}|${form.watch("account_kind")}`}
          onValueChange={(value) => {
            const [accountId, accountKind] = value.split("|");
            form.setValue("account_id", accountId);
            form.setValue("account_kind", accountKind as FormValues["account_kind"]);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {myAccounts.length > 0 && (
              <SelectGroup>
                <SelectLabel>Meus</SelectLabel>
                {myAccounts.map((account) => (
                  <SelectItem key={account.id} value={`${account.account_key}|${account.kind}`}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {myAccounts.length > 0 && householdAccounts.length > 0 && <SelectSeparator />}
            {householdAccounts.length > 0 && (
              <SelectGroup>
                <SelectLabel>Da família</SelectLabel>
                {householdAccounts.map((account) => (
                  <SelectItem key={account.id} value={`${account.account_key}|${account.kind}`}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {accounts.length === 0 && (
              <SelectItem value="manual-cash|checking">Dinheiro</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      {form.watch("account_kind") === "credit_card" ? (
        <div className="md:col-span-2">
          <Label>Parcelas</Label>
          <Input type="number" min={1} max={60} {...form.register("installments_count")} />
          {form.watch("installments_count") > 1 && form.watch("amount") > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {form.watch("installments_count")}x de{" "}
              {(form.watch("amount") / form.watch("installments_count")).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}{" "}
              (aprox.)
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-end gap-2 md:col-span-4">
        <Button type="submit" disabled={saveMutation.isPending}>
          Salvar lançamento
        </Button>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </div>
    </form>
  );

  if (bare) {
    return formContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lançamento rápido</CardTitle>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
