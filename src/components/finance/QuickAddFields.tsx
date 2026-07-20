import { Loader2, Mic, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { defaultPaymentMethod } from "@/lib/finance/transactionIcons";
import { categoryTypeLabel } from "@/lib/finance/types";
import { formatSeconds, PROCESSING_LABEL, type QuickAddFormValues } from "./useQuickAddForm";
import type { useQuickAddForm } from "./useQuickAddForm";

type Api = ReturnType<typeof useQuickAddForm>;

type Props = {
  api: Api;
  autoFocusInput?: boolean;
  /** Hide the record/mic button — used in "Editar" mode (VoiceCaptureFlow),
   *  where the audio was already captured and re-recording doesn't apply. */
  hideRecordButton?: boolean;
  /** Hide the transcription textarea/mic block — used by TransactionEditDialog,
   *  which renders TranscriptionField on its own separate tab instead. */
  hideTranscription?: boolean;
  /** Disables the origem/destino account selects — used when editing an
   *  existing transfer, where re-pointing either account isn't supported
   *  (would require deleting and recreating the pair). Only amount,
   *  description, date and category stay editable. */
  disableAccountFields?: boolean;
};

/** Texto ditado/anotação + gravação/transcrição — extraído de QuickAddFields
 *  para poder ser exibido sozinho (ex: aba "Transcrição" do modal de edição)
 *  sem duplicar o mic/record/"Interpretar texto". */
export function TranscriptionField({
  api,
  autoFocusInput,
  hideRecordButton,
}: {
  api: Api;
  autoFocusInput?: boolean;
  hideRecordButton?: boolean;
}) {
  const { form, recording, recordingSeconds, processingStage, pendingAudio } = api;

  return (
    <div>
      <Label>Texto ditado ou anotação</Label>
      <div className="mt-1 flex items-start gap-2">
        <Textarea
          placeholder="Ex: gastei 42 reais no mercado hoje no cartão"
          autoFocus={autoFocusInput}
          {...form.register("original_text")}
        />
        {hideRecordButton ? null : (
          <div className="flex flex-col items-center gap-1">
            <Button
              type="button"
              variant={recording ? "destructive" : "outline"}
              size="icon"
              disabled={processingStage !== "idle"}
              aria-label={recording ? "Parar gravação" : "Gravar áudio"}
              className={recording ? "animate-pulse" : undefined}
              onClick={api.toggleRecording}
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
        )}
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
        onClick={api.interpretNativeText}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Interpretar texto
      </Button>
      {pendingAudio ? (
        <Button
          type="button"
          variant="outline"
          className="ml-2 mt-2"
          onClick={() => api.transcribeAndInterpretAudio(pendingAudio)}
        >
          Tentar transcrição de novo
        </Button>
      ) : null}
    </div>
  );
}

/** The full field set of the quick-add form — shared between the standalone
 *  manual form (QuickAddForm) and the "Editar" stage of VoiceCaptureFlow, so
 *  the ~20 fields/Selects only exist in one place. */
export function QuickAddFields({
  api,
  autoFocusInput,
  hideRecordButton,
  hideTranscription,
  disableAccountFields,
}: Props) {
  const { form } = api;
  const isTransfer = form.watch("transaction_type") === "transfer";

  return (
    <div className="grid gap-4 md:grid-cols-6">
      {hideTranscription ? null : (
        <div className="md:col-span-6">
          <TranscriptionField
            api={api}
            autoFocusInput={autoFocusInput}
            hideRecordButton={hideRecordButton}
          />
        </div>
      )}

      <div className="md:col-span-1">
        <Label>Tipo</Label>
        <Select
          value={form.watch("transaction_type")}
          onValueChange={(value) =>
            form.setValue("transaction_type", value as QuickAddFormValues["transaction_type"])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">{categoryTypeLabel.expense}</SelectItem>
            <SelectItem value="income">{categoryTypeLabel.income}</SelectItem>
            <SelectItem value="transfer">{categoryTypeLabel.transfer}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-1">
        <Label>Valor</Label>
        <Input type="number" step="0.01" {...form.register("amount")} />
      </div>
      <div className="md:col-span-2">
        <Label>Descrição</Label>
        <Input {...form.register("description")} onBlur={api.suggestCategory} />
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
            {api.categoryItems.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <Label>{isTransfer ? "Conta de origem" : "Conta/cartão"}</Label>
        <Select
          disabled={disableAccountFields}
          value={`${form.watch("account_id")}|${form.watch("account_kind")}|${form.watch("additional_card_id") ?? ""}`}
          onValueChange={(value) => {
            const [accountId, accountKind, additionalCardId] = value.split("|");
            form.setValue("account_id", accountId);
            form.setValue("account_kind", accountKind as QuickAddFormValues["account_kind"]);
            form.setValue("payment_method", defaultPaymentMethod(accountKind));
            form.setValue("additional_card_id", additionalCardId || null);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {api.myPaymentOptions.length > 0 && (
              <SelectGroup>
                <SelectLabel>Meus</SelectLabel>
                {api.myPaymentOptions.map((option) => (
                  <SelectItem
                    key={`${option.account.id}|${option.additionalCardId ?? ""}`}
                    value={`${option.accountId}|${option.accountKind}|${option.additionalCardId ?? ""}`}
                  >
                    {option.displayLabel}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {api.myPaymentOptions.length > 0 && api.householdPaymentOptions.length > 0 && (
              <SelectSeparator />
            )}
            {api.householdPaymentOptions.length > 0 && (
              <SelectGroup>
                <SelectLabel>Da família</SelectLabel>
                {api.householdPaymentOptions.map((option) => (
                  <SelectItem
                    key={`${option.account.id}|${option.additionalCardId ?? ""}`}
                    value={`${option.accountId}|${option.accountKind}|${option.additionalCardId ?? ""}`}
                  >
                    {option.displayLabel}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {api.orderedAccounts.length === 0 && (
              <SelectItem value="manual-cash|checking|">Dinheiro</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      {isTransfer ? (
        <div className="md:col-span-2">
          <Label>Conta de destino</Label>
          <Select
            disabled={disableAccountFields}
            value={form.watch("destination_account_id") || ""}
            onValueChange={(value) => form.setValue("destination_account_id", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a conta de destino" />
            </SelectTrigger>
            <SelectContent>
              {api.myPaymentOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Meus</SelectLabel>
                  {api.myPaymentOptions.map((option) => (
                    <SelectItem key={option.account.id} value={option.accountId}>
                      {option.account.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {api.myPaymentOptions.length > 0 && api.householdPaymentOptions.length > 0 && (
                <SelectSeparator />
              )}
              {api.householdPaymentOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Da família</SelectLabel>
                  {api.householdPaymentOptions.map((option) => (
                    <SelectItem key={option.account.id} value={option.accountId}>
                      {option.account.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {!isTransfer && form.watch("account_kind") === "checking" ? (
        <div className="md:col-span-2">
          <Label>Forma de pagamento</Label>
          <Select
            value={form.watch("payment_method")}
            onValueChange={(value) =>
              form.setValue("payment_method", value as QuickAddFormValues["payment_method"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debit">Débito</SelectItem>
              <SelectItem value="pix">Pix</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {!isTransfer && form.watch("account_kind") === "credit_card" ? (
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
    </div>
  );
}
