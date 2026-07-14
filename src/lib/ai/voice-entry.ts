import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";

export type PaymentMethodHint = "debit" | "credit" | "cash" | "pix" | null;

export type VoiceTransactionDraft = {
  original_text: string;
  description: string;
  amount: number;
  transaction_type: "expense" | "income" | "transfer";
  date: string;
  account_hint: string | null;
  payment_method_hint: PaymentMethodHint;
  installments_count: number;
  confidence: number;
};

type VoiceTextInput = {
  text: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function textSystemPrompt(todayStr: string): string {
  return `Você transforma uma frase curta em um lançamento financeiro estruturado.
Responda APENAS JSON válido:
{
  "original_text": string,
  "description": string,
  "amount": number,
  "transaction_type": "expense" | "income" | "transfer",
  "date": "YYYY-MM-DD",
  "account_hint": string | null,
  "payment_method_hint": "debit" | "credit" | "cash" | "pix" | null,
  "installments_count": number,
  "confidence": number
}

Regras:
- amount é sempre o valor TOTAL da compra (positivo), mesmo quando parcelado.
  Ex: "390 reais em 3 parcelas" -> amount 390, installments_count 3 (não 130).
- transaction_type "expense" para gastos, "income" para entradas, "transfer" para transferências.
- Hoje é ${todayStr}. Use essa data como referência para expressões relativas
  ("hoje", "ontem", "semana passada"). Se não houver nenhuma pista de data na fala, use ${todayStr}.
  Nunca invente uma data antiga ou arbitrária — na dúvida, use ${todayStr}.
- account_hint: só o NOME/instituição da conta ou cartão mencionado (ex: "Nubank", "Inter"),
  sem a palavra "cartão"/"conta". null se não houver nome específico.
- payment_method_hint: classifique a forma de pagamento mencionada:
  "debit" para "débito", "cash" para "dinheiro"/"espécie", "pix" para "pix",
  "credit" para "crédito"/"cartão" (sem especificar débito). null se não houver menção.
- installments_count: número de parcelas mencionado (ex: "em 3 vezes", "parcelado em 5"). 1 se à vista ou não mencionado.
- confidence entre 0 e 1.`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Guards against the model hallucinating an implausible date (e.g. epoch
 *  "1970-01-01", or some other placeholder) — falls back to today instead
 *  of trusting whatever string comes back verbatim. */
function plausibleDate(value: unknown, todayStr: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return todayStr;
  const year = Number(value.slice(0, 4));
  const currentYear = Number(todayStr.slice(0, 4));
  if (year < currentYear - 1 || year > currentYear + 1) return todayStr;
  return value;
}

export function parseDraft(
  rawText: string,
  fallbackText: string,
  todayStr: string = today(),
): VoiceTransactionDraft {
  const jsonStart = rawText.indexOf("{");
  const jsonEnd = rawText.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error("A IA não retornou um JSON de lançamento.");
  }
  const parsed = JSON.parse(
    rawText.slice(jsonStart, jsonEnd + 1),
  ) as Partial<VoiceTransactionDraft>;
  if (!parsed.description || !Number.isFinite(parsed.amount)) {
    throw new Error("Não foi possível identificar descrição e valor no relato.");
  }
  const installments = Number(parsed.installments_count);
  return {
    original_text: parsed.original_text ?? fallbackText,
    description: parsed.description,
    amount: Math.abs(Number(parsed.amount)),
    transaction_type: parsed.transaction_type ?? "expense",
    date: plausibleDate(parsed.date, todayStr),
    account_hint: parsed.account_hint ?? null,
    payment_method_hint: parsed.payment_method_hint ?? null,
    installments_count: Number.isFinite(installments) && installments >= 1 ? installments : 1,
    confidence: Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 0.7,
  };
}

export const extractVoiceTextFn = createServerFn({ method: "POST" })
  .validator((data: VoiceTextInput) => data)
  .handler(async ({ data }): Promise<VoiceTransactionDraft> => {
    const text = data.text.trim();
    if (!text) throw new Error("Informe um texto para interpretar.");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    const todayStr = today();
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: textSystemPrompt(todayStr),
      messages: [{ role: "user", content: text }],
    });
    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return parseDraft(rawText, text, todayStr);
  });
