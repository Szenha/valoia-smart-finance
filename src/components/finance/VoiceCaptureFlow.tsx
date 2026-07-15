import { Loader2, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { categoryPath } from "@/lib/finance/categories";
import { resolveMemberColor, resolveMemberName } from "@/lib/finance/member-visuals";
import { paymentMethodLabel, type PaymentMethod } from "@/lib/finance/transactionIcons";
import {
  accountLabel,
  formatCurrency,
  type AccountRow,
  type CategoryRow,
  type HouseholdMemberRow,
  type ProfileRow,
} from "@/lib/finance/types";
import { formatSeconds, useQuickAddForm } from "./useQuickAddForm";
import { QuickAddFields } from "./QuickAddFields";

type Stage = "listening" | "processing" | "confirm" | "edit";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  userId: string | null;
  categories: CategoryRow[];
  accounts: AccountRow[];
  members: HouseholdMemberRow[];
  profiles: ProfileRow[];
};

const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

export function VoiceCaptureFlow({
  open,
  onOpenChange,
  orgId,
  userId,
  categories,
  accounts,
  members,
  profiles,
}: Props) {
  const [stage, setStage] = useState<Stage>("listening");
  const wasBusyRef = useRef(false);
  const api = useQuickAddForm({
    orgId,
    userId,
    categories,
    accounts,
    onSaved: () => onOpenChange(false),
  });

  // Auto-start recording the moment the flow opens; clean up if it closes
  // mid-flight (cancel, backdrop click, Escape).
  useEffect(() => {
    if (open) {
      setStage("listening");
      void api.toggleRecording();
    } else {
      api.cancelRecording();
    }
    // Only the open/close transition should (re)kick this off — api is a
    // fresh object every render and must not retrigger the recorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Once processing (transcribe + interpret) has actually run and settled
  // back to idle, move on to the confirmation step — unless it failed,
  // signaled by a still-pending audio blob.
  useEffect(() => {
    if (stage !== "processing") {
      wasBusyRef.current = false;
      return;
    }
    if (api.processingStage !== "idle") {
      wasBusyRef.current = true;
      return;
    }
    if (wasBusyRef.current) {
      wasBusyRef.current = false;
      if (!api.pendingAudio) setStage("confirm");
    }
  }, [stage, api.processingStage, api.pendingAudio]);

  function handleStopRecording() {
    void api.toggleRecording();
    setStage("processing");
  }

  function handleClose() {
    onOpenChange(false);
  }

  const values = api.form.getValues();
  const currentMember = members.find((member) => member.user_id === userId);
  const currentProfile = profiles.find((profile) => profile.id === userId);
  const memberName = userId ? resolveMemberName(currentMember, currentProfile, userId) : "Eu";
  const memberColor = userId ? resolveMemberColor(userId, currentMember?.color ?? null) : "#059669";
  const account = accounts.find((a) => a.account_key === values.account_id);

  const isDarkStage = stage === "listening" || stage === "processing";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent
        hideCloseButton
        className={
          isDarkStage
            ? "fixed inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-none bg-[#0a0a0a] p-0 text-white sm:rounded-none"
            : "max-w-md"
        }
        onOpenAutoFocus={(event) => isDarkStage && event.preventDefault()}
      >
        <DialogTitle className="sr-only">
          {stage === "listening"
            ? "Escutando"
            : stage === "processing"
              ? "Processando"
              : stage === "edit"
                ? "Editar lançamento"
                : "Confirme seu lançamento"}
        </DialogTitle>

        {isDarkStage ? (
          <div className="flex h-full flex-col items-center justify-between px-6 py-10">
            <div className="flex w-full items-center justify-start">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10 hover:text-white"
                  aria-label="Cancelar"
                >
                  <X className="h-5 w-5" />
                </Button>
              </DialogClose>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
              <p className="text-lg font-medium">
                {stage === "listening" ? "Escutando..." : "Processando..."}
              </p>
              <Waveform streamRef={api.mediaStreamRef} active={stage === "listening"} />
              {stage === "listening" ? (
                <span className="text-sm tabular-nums text-white/70">
                  {formatSeconds(api.recordingSeconds)}
                </span>
              ) : null}
              {stage === "processing" ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
              <p className="max-w-xs text-sm text-white/60">
                {stage === "listening"
                  ? "Fale sobre sua despesa (ex: valor, categoria, descrição)"
                  : "Convertendo sua fala em lançamento..."}
              </p>
              {stage === "processing" && api.pendingAudio ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-rose-300">{api.status}</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        api.pendingAudio && api.transcribeAndInterpretAudio(api.pendingAudio)
                      }
                    >
                      Tentar de novo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-white"
                      onClick={handleClose}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex w-full items-center justify-center">
              {stage === "listening" ? (
                <Button
                  type="button"
                  size="icon"
                  className="h-16 w-16 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  aria-label="Parar gravação"
                  onClick={handleStopRecording}
                >
                  <Square className="h-6 w-6 fill-current" />
                </Button>
              ) : (
                <div className="h-16 w-16" />
              )}
            </div>
          </div>
        ) : stage === "confirm" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Confirme seu lançamento</h2>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <SummaryField label="Valor" value={formatCurrency(values.amount)} />
              <SummaryField label="Tipo" value={TRANSACTION_TYPE_LABEL[values.transaction_type]} />
              <SummaryField
                label="Categoria"
                value={categoryPath(categories, values.category_id || null)}
              />
              <SummaryField
                label="Forma de pagamento"
                value={
                  paymentMethodLabel[values.payment_method as PaymentMethod] ??
                  values.payment_method
                }
              />
              <SummaryField
                label="Descrição"
                value={values.description || "—"}
                className="col-span-2"
              />
              <SummaryField
                label="Data"
                value={new Date(values.posted_at).toLocaleDateString("pt-BR")}
              />
              <SummaryField
                label="Conta/cartão"
                value={
                  account ? account.name : accountLabel(values.account_id, values.account_kind)
                }
              />
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <MemberAvatar name={memberName} color={memberColor} />
                <span className="text-sm text-muted-foreground">Lançado por {memberName}</span>
              </div>
            </dl>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStage("edit")}
              >
                Editar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={api.saveMutation.isPending}
                onClick={() => api.saveMutation.mutate(values)}
              >
                Confirmar
              </Button>
            </div>
            {api.saveMutation.error ? (
              <p className="text-sm text-red-600">
                {api.saveMutation.error instanceof Error
                  ? api.saveMutation.error.message
                  : String(api.saveMutation.error)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Editar lançamento</h2>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
            <QuickAddFields api={api} hideRecordButton />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStage("confirm")}
              >
                Voltar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={api.saveMutation.isPending}
                onClick={() => api.saveMutation.mutate(api.form.getValues())}
              >
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Reactive waveform while listening (Web Audio AnalyserNode over the live
 *  mic stream); while frozen (processing), just holds still bars — matching
 *  the reference mockup, which allows either a literal frozen frame or a
 *  static version of the same animation. */
function Waveform({
  streamRef,
  active,
}: {
  streamRef: RefObject<MediaStream | null>;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let frame = 0;
    let cancelled = false;
    let data: Uint8Array<ArrayBuffer> | null = null;

    function draw() {
      if (cancelled || !analyser || !data) return;
      analyser.getByteFrequencyData(data);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);
        const barCount = 28;
        const step = Math.max(1, Math.floor(data.length / barCount));
        const barWidth = width / barCount;
        ctx.fillStyle = "#34d399";
        for (let i = 0; i < barCount; i++) {
          const value = data[i * step] / 255;
          const barHeight = Math.max(4, value * height);
          ctx.fillRect(i * barWidth + 2, (height - barHeight) / 2, barWidth - 4, barHeight);
        }
      }
      frame = requestAnimationFrame(draw);
    }

    function setupWhenReady() {
      if (cancelled) return;
      const stream = streamRef.current;
      if (!stream) {
        frame = requestAnimationFrame(setupWhenReady);
        return;
      }
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      data = new Uint8Array(analyser.frequencyBinCount);
      draw();
    }

    setupWhenReady();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      void audioCtx?.close();
    };
  }, [active, streamRef]);

  return <canvas ref={canvasRef} width={280} height={80} className="mx-auto" />;
}
