import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";

export type VoiceTransactionDraft = {
  original_text: string;
  description: string;
  amount: number;
  transaction_type: "expense" | "income" | "transfer";
  date: string;
  account_hint: string | null;
  confidence: number;
};

type VoiceTextInput = {
  text: string;
};

type VoiceAudioInput = {
  audioBase64: string;
  mimeType: string;
};

const TODAY = new Date().toISOString().slice(0, 10);

const TEXT_SYSTEM_PROMPT = `Você transforma uma frase curta em um lançamento financeiro estruturado.
Responda APENAS JSON válido:
{
  "original_text": string,
  "description": string,
  "amount": number,
  "transaction_type": "expense" | "income" | "transfer",
  "date": "YYYY-MM-DD",
  "account_hint": string | null,
  "confidence": number
}

Regras:
- amount sempre positivo.
- transaction_type "expense" para gastos, "income" para entradas, "transfer" para transferências.
- Se não houver data, use ${TODAY}.
- Não invente conta; se a fala mencionar cartão/conta/banco, coloque em account_hint.
- confidence entre 0 e 1.`;

function parseDraft(rawText: string, fallbackText: string): VoiceTransactionDraft {
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
  return {
    original_text: parsed.original_text ?? fallbackText,
    description: parsed.description,
    amount: Math.abs(Number(parsed.amount)),
    transaction_type: parsed.transaction_type ?? "expense",
    date: parsed.date ?? TODAY,
    account_hint: parsed.account_hint ?? null,
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
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: TEXT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return parseDraft(rawText, text);
  });

export const transcribeVoiceAudioFn = createServerFn({ method: "POST" })
  .validator((data: VoiceAudioInput) => data)
  .handler(async ({ data }): Promise<VoiceTransactionDraft> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    if (!data.audioBase64) throw new Error("Áudio vazio.");
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1600,
      system: TEXT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcreva este áudio curto em português e extraia o lançamento financeiro. Responda no JSON solicitado.",
            },
            {
              type: "input_audio",
              source: {
                type: "base64",
                media_type: data.mimeType,
                data: data.audioBase64,
              },
            },
          ] as unknown as Anthropic.MessageParam["content"],
        },
      ],
    });
    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return parseDraft(rawText, "[audio]");
  });
