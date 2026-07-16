import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { transcribeAudioFn, type TranscriptionResult } from "@/lib/ai/transcribe-audio";
import { extractVoiceTextFn, type PaymentMethodHint } from "@/lib/ai/voice-entry";
import { buildPaymentOptions, matchPaymentAccount } from "@/lib/finance/account-match";
import { suggestCategoryForDescription } from "@/lib/classification/suggest";
import { categoryPath, leafCategoryOptions } from "@/lib/finance/categories";
import { ensureAccountFromTransaction } from "@/lib/finance/data";
import { computeInstallmentSchedule } from "@/lib/finance/installments";
import { resolveMemberName } from "@/lib/finance/member-visuals";
import { defaultPaymentMethod } from "@/lib/finance/transactionIcons";
import type {
  AccountRow,
  AdditionalCardRow,
  CategoryRow,
  HouseholdMemberRow,
  ProfileRow,
} from "@/lib/finance/types";
import { supabase } from "@/lib/supabase/client";

const schema = z.object({
  transaction_type: z.enum(["expense", "income", "transfer"]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().min(2, "Descreva o lançamento"),
  category_id: z.string().optional(),
  posted_at: z.string().min(10),
  account_id: z.string().min(1, "Selecione a conta ou cartão utilizado"),
  account_kind: z.enum(["checking", "credit_card", "investment"]),
  payment_method: z.enum(["debit", "credit_card", "pix", "other"]),
  installments_count: z.coerce.number().int().min(1).max(60),
  original_text: z.string().optional(),
  // Setado quando a conta/cartão escolhido é um cartão adicional — grava
  // account_id/kind do cartão pai (mesmo limite), mas atribui o gasto ao
  // membro vinculado ao adicional, separado de quem lançou (created_by).
  additional_card_id: z.string().nullable().optional(),
});

export type QuickAddFormValues = z.infer<typeof schema>;

type PendingAudio = {
  audioBase64: string;
  mimeType: string;
  durationMs: number;
};

export type ProcessingStage = "idle" | "transcribing" | "interpreting";

export const PROCESSING_LABEL: Record<Exclude<ProcessingStage, "idle">, string> = {
  transcribing: "Transcrevendo áudio…",
  interpreting: "Interpretando lançamento…",
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

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type Options = {
  orgId: string;
  userId: string | null;
  categories: CategoryRow[];
  accounts: AccountRow[];
  additionalCards?: AdditionalCardRow[];
  members?: HouseholdMemberRow[];
  profiles?: ProfileRow[];
  onSaved?: () => void;
  /** When set, saveMutation updates this existing transaction in place
   *  instead of inserting a new one — installments/plan creation is skipped
   *  since editing an existing installment's plan is out of scope here. */
  editingTransactionId?: string;
  initialValues?: Partial<QuickAddFormValues>;
};

/**
 * Recording + transcription + interpretation + save logic for the quick-add
 * flow, shared between the full manual form (QuickAddForm) and the 4-stage
 * voice capture overlay (VoiceCaptureFlow) — both drive the same state
 * machine, they just present it differently.
 */
export function useQuickAddForm({
  orgId,
  userId,
  categories,
  accounts,
  additionalCards = [],
  members = [],
  profiles = [],
  onSaved,
  editingTransactionId,
  initialValues,
}: Options) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>("idle");
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [usedAiDraft, setUsedAiDraft] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Live mic stream while recording — exposed so a waveform visualization
   *  can attach an AnalyserNode to the same audio source. */
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const categoryItems = leafCategoryOptions(categories);
  const myAccounts = accounts.filter((account) => account.owner_user_id === userId);
  const householdAccounts = accounts.filter((account) => account.owner_user_id !== userId);
  const orderedAccounts = [...myAccounts, ...householdAccounts];
  // Same account list, but with each additional card injected as its own
  // selectable option (inheriting account_id/kind from its parent card) —
  // grouped by who it's assigned to, same "Meus"/"Da família" split as
  // plain accounts.
  const paymentOptions = buildPaymentOptions(accounts, additionalCards).map((option) => ({
    ...option,
    displayLabel: option.additionalCardId
      ? (option.label ??
        `${option.account.name} — ${resolveMemberName(
          members.find((member) => member.user_id === option.ownerId),
          profiles.find((profile) => profile.id === option.ownerId),
          option.ownerId,
        )}`)
      : option.account.name,
  }));
  const myPaymentOptions = paymentOptions.filter((option) => option.ownerId === userId);
  const householdPaymentOptions = paymentOptions.filter((option) => option.ownerId !== userId);
  const additionalCardById = new Map(additionalCards.map((card) => [card.id, card]));

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

  const form = useForm<QuickAddFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      transaction_type: "expense",
      amount: 0,
      description: "",
      category_id: "",
      posted_at: today(),
      account_id: orderedAccounts[0]?.account_key ?? "manual-cash",
      account_kind: orderedAccounts[0]?.kind ?? "checking",
      payment_method: defaultPaymentMethod(orderedAccounts[0]?.kind ?? "checking"),
      installments_count: 1,
      original_text: "",
      ...initialValues,
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: QuickAddFormValues) => {
      if (!values.account_id) {
        throw new Error("Selecione a conta ou cartão utilizado antes de salvar.");
      }
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

      const spentByMemberId = values.additional_card_id
        ? (additionalCardById.get(values.additional_card_id)?.member_user_id ?? null)
        : null;

      if (editingTransactionId) {
        const { error } = await supabase
          .from("transactions")
          .update({
            description: values.description,
            type: signedType,
            account_id: values.account_id,
            account_kind: values.account_kind,
            payment_method: values.payment_method,
            category_id: values.category_id || null,
            amount: sign * Math.abs(values.amount),
            posted_at: new Date(values.posted_at).toISOString(),
            classification_method: values.category_id ? "manual" : null,
            classification_confidence: values.category_id ? 1 : null,
            needs_review: !values.category_id,
            spent_by_member_id: spentByMemberId,
          })
          .eq("id", editingTransactionId)
          .eq("organization_id", orgId);
        if (error) throw new Error(error.message);
        return;
      }

      const baseRow = {
        organization_id: orgId,
        description: values.description,
        type: signedType,
        account_id: values.account_id,
        account_kind: values.account_kind,
        payment_method: values.payment_method,
        entry_source: usedAiDraft ? "voice_ai" : "manual",
        currency: "BRL",
        created_by: userId,
        spent_by_member_id: spentByMemberId,
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
      if (!editingTransactionId) {
        form.reset({
          transaction_type: "expense",
          amount: 0,
          description: "",
          category_id: "",
          posted_at: today(),
          account_id: form.getValues("account_id"),
          account_kind: form.getValues("account_kind"),
          payment_method: form.getValues("payment_method"),
          additional_card_id: form.getValues("additional_card_id"),
          installments_count: 1,
          original_text: "",
        });
        setUsedAiDraft(false);
      }
      setStatus(editingTransactionId ? "Lançamento atualizado." : "Lançamento salvo.");
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
    const match = matchPaymentAccount(
      accounts,
      additionalCards,
      { paymentMethodHint: draft.payment_method_hint, accountNameHint: draft.account_hint },
      userId,
    );
    if (match.status === "resolved") {
      form.setValue("account_id", match.accountId);
      form.setValue("account_kind", match.accountKind);
      form.setValue("payment_method", defaultPaymentMethod(match.accountKind));
      form.setValue("additional_card_id", match.additionalCardId);
      return "";
    }
    if (match.status === "ambiguous") {
      form.setValue("account_id", "");
      form.setValue("additional_card_id", null);
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
      setUsedAiDraft(true);
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
      setUsedAiDraft(true);
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
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
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

  function cancelRecording() {
    if (recording) {
      if (recorderRef.current) recorderRef.current.onstop = null;
      recorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setRecording(false);
      stopRecordingTimer();
    }
    setPendingAudio(null);
    setProcessingStage("idle");
  }

  return {
    form,
    status,
    setStatus,
    recording,
    recordingSeconds,
    processingStage,
    pendingAudio,
    usedAiDraft,
    mediaStreamRef,
    categoryItems,
    myAccounts,
    householdAccounts,
    orderedAccounts,
    myPaymentOptions,
    householdPaymentOptions,
    saveMutation,
    suggestCategory,
    interpretNativeText,
    transcribeAndInterpretAudio,
    toggleRecording,
    cancelRecording,
  };
}
