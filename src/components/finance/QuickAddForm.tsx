import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { transcribeAudioFn, type TranscriptionResult } from "@/lib/ai/transcribe-audio";
import { extractVoiceTextFn } from "@/lib/ai/voice-entry";
import { suggestCategoryForDescription } from "@/lib/classification/suggest";
import type { AccountRow, CategoryRow } from "@/lib/finance/types";
import { supabase } from "@/lib/supabase/client";

const schema = z.object({
  transaction_type: z.enum(["expense", "income", "transfer"]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().min(2, "Descreva o lançamento"),
  category_id: z.string().optional(),
  posted_at: z.string().min(10),
  account_id: z.string().min(1),
  account_kind: z.enum(["checking", "credit_card", "investment"]),
  original_text: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  orgId: string;
  userId: string | null;
  categories: CategoryRow[];
  accounts: AccountRow[];
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

export function QuickAddForm({ orgId, userId, categories, accounts }: Props) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [recording, setRecording] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      transaction_type: "expense",
      amount: 0,
      description: "",
      category_id: "",
      posted_at: today(),
      account_id: accounts[0]?.account_key ?? "manual-cash",
      account_kind: accounts[0]?.kind ?? "checking",
      original_text: "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const signedAmount =
        values.transaction_type === "expense" ? -Math.abs(values.amount) : Math.abs(values.amount);
      const fitId = `MANUAL-${crypto.randomUUID()}`;
      const { error } = await supabase.from("transactions").insert({
        organization_id: orgId,
        amount: signedAmount,
        description: values.description,
        posted_at: new Date(values.posted_at).toISOString(),
        fit_id: fitId,
        type:
          values.transaction_type === "expense"
            ? "MANUAL_DEBIT"
            : values.transaction_type === "income"
              ? "MANUAL_CREDIT"
              : "MANUAL_TRANSFER",
        account_id: values.account_id,
        account_kind: values.account_kind,
        currency: "BRL",
        created_by: userId,
        category_id: values.category_id || null,
        original_text: values.original_text || null,
        classification_method: values.category_id ? "manual" : null,
        classification_confidence: values.category_id ? 1 : null,
        needs_review: !values.category_id,
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
        original_text: "",
      });
      setStatus("Lançamento salvo.");
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
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
        categories,
      );
      if (suggestion.category_id) {
        form.setValue("category_id", suggestion.category_id);
        const label = categories.find((c) => c.id === suggestion.category_id)?.name;
        setStatus(`Categoria sugerida: ${label ?? "categoria encontrada"}.`);
      } else {
        setStatus("Nenhuma categoria sugerida.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
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
      await suggestCategory();
      setStatus("Confira os campos antes de salvar.");
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
    setStatus("Transcrevendo áudio…");
    try {
      const transcription = await transcribeAudioFn({ data: audio });
      await logTranscriptionUsage(transcription);
      form.setValue("original_text", transcription.text);

      setStatus("Interpretando transcrição…");
      const draft = await extractVoiceTextFn({ data: { text: transcription.text } });
      form.setValue("description", draft.description);
      form.setValue("amount", draft.amount);
      form.setValue("transaction_type", draft.transaction_type);
      form.setValue("posted_at", draft.date);
      setPendingAudio(null);
      await suggestCategory();
      setStatus("Transcrição interpretada. Confira antes de salvar.");
    } catch (err) {
      setPendingAudio(audio);
      setStatus(
        `Não consegui transcrever o áudio. Ele ficou pendente para nova tentativa: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
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
      setStatus("Gravando…");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lançamento rápido</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          className="grid gap-4 md:grid-cols-6"
        >
          <div className="md:col-span-6">
            <Label>Texto ditado ou anotação</Label>
            <div className="mt-1 flex gap-2">
              <Textarea
                placeholder="Ex: gastei 42 reais no mercado hoje no cartão"
                {...form.register("original_text")}
              />
              <Button type="button" variant="outline" size="icon" onClick={toggleRecording}>
                {recording ? <MicOff /> : <Mic />}
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
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
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
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
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={`${account.account_key}|${account.kind}`}>
                    {account.name}
                  </SelectItem>
                ))}
                {accounts.length === 0 && (
                  <SelectItem value="manual-cash|checking">Dinheiro</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 md:col-span-4">
            <Button type="submit" disabled={saveMutation.isPending}>
              Salvar lançamento
            </Button>
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
