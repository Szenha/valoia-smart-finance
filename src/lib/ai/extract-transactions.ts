import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";

// ── Types ──────────────────────────────────────────────────────────────────

export type AiTransaction = {
  date: string; // "YYYY-MM-DD"
  description: string; // original, including "PARC XX/YY" when present
  amount: number; // POSITIVE = expense/charge; NEGATIVE = payment/credit
  confidence: number; // 0–1
  source_excerpt: string; // raw text snippet that produced this line
  installment_number?: number | null; // 3 for "PARC 03/08"
  total_installments?: number | null; // 8 for "PARC 03/08"
};

export type BatchResult = {
  transactions: AiTransaction[];
  partial_total: number; // sum of positives in this batch
  declared_future_installments?: number | null;
  stopped_early: boolean; // true if the AI hit max_tokens
};

// ── Text splitting (pure — runs client-side) ───────────────────────────────

// DD/MM date pattern — marks the likely start of a new transaction line.
const TX_DATE_RE = /\d{2}\/\d{2}/g;

/**
 * Splits raw PDF text into batches small enough for a single AI call.
 *
 * Does NOT rely on newlines (pdfjs-dist often produces a nearly flat string).
 * Instead it splits every ~maxCharsPerBatch chars, but walks backwards from
 * the target cut point to find the last DD/MM date pattern in the final 30%
 * of the window — that position is very likely the start of a new transaction,
 * so we never cut a transaction in half.
 */
export function splitTextIntoBatches(text: string, maxCharsPerBatch = 5_000): string[] {
  const batches: string[] = [];
  let start = 0;

  while (start < text.length) {
    if (text.length - start <= maxCharsPerBatch) {
      const last = text.slice(start).trim();
      if (last.length > 0) batches.push(last);
      break;
    }

    const target = start + maxCharsPerBatch;

    // Search for the last DD/MM occurrence in the final 30% of the window.
    // Splitting there puts us between two transactions.
    const lookbackFrom = start + Math.floor(maxCharsPerBatch * 0.7);
    const boundary = _lastDatePos(text, lookbackFrom, target);

    let end: number;
    if (boundary > lookbackFrom) {
      end = boundary;
    } else {
      // No date found in lookback window — fall back to last newline, then hard cut
      const lastNl = text.lastIndexOf("\n", target);
      end = lastNl > start ? lastNl + 1 : target;
    }

    const batch = text.slice(start, end).trim();
    if (batch.length > 0) batches.push(batch);
    start = end;
  }

  return batches.filter((b) => b.trim().length > 0);
}

/** Returns the index of the last DD/MM match in text[from..to), or -1. */
function _lastDatePos(text: string, from: number, to: number): number {
  TX_DATE_RE.lastIndex = from;
  let lastPos = -1;
  let m: RegExpExecArray | null;
  while ((m = TX_DATE_RE.exec(text)) !== null) {
    if (m.index >= to) break;
    lastPos = m.index;
  }
  return lastPos;
}

// ── Server function (one AI call per batch) ────────────────────────────────

type BatchInput = {
  batchText: string;
  filename: string;
  batchIndex: number; // 0-based
  totalBatches: number;
};

const SYSTEM_PROMPT = `Você é um extrator especializado em faturas de cartão de crédito brasileiras.
Dado um trecho do texto bruto de uma fatura (extraído via OCR de PDF), retorne um objeto JSON com a seguinte estrutura:

{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "descrição original completa, incluindo 'PARC XX/YY' se presente",
      "amount": number,
      "confidence": number,
      "source_excerpt": "trecho exato do texto",
      "installment_number": number | null,
      "total_installments": number | null
    }
  ],
  "partial_total": number,
  "declared_future_installments": number | null
}

CONVENÇÃO DE SINAL — obrigatória, sem exceção:
  • Compras, débitos, encargos, anuidades, juros → amount POSITIVO
      Exemplo: compra R$ 89,99 → amount: 89.99
  • Pagamentos, créditos, estornos → amount NEGATIVO
      Exemplo: pagamento R$ 1.200,00 → amount: -1200.00

INSTRUÇÕES CRÍTICAS — leia com atenção:

1. EXTRAÇÃO COMPLETA: Extraia CADA linha de transação individual presente neste trecho.
   Nunca omita linhas, nunca agrupe transações, mesmo que a descrição se repita.

2. NUNCA TROQUE VALORES: Se duas linhas têm descrições iguais ou parecidas (ex: "CLUB MED PARC 03/08"
   e "CLUB MED PARC 04/08"), cada uma tem seu próprio valor. Use EXATAMENTE o valor que está
   NA MESMA LINHA da descrição. Nunca use o valor de outra linha.

3. PARCELAMENTOS: Se a descrição contiver padrão "PARC XX/YY" ou "PAR XX/YY" (ex: "PARC 03/08" =
   parcela 3 de 8), preencha installment_number=3 e total_installments=8. Caso contrário, null.

4. SALDO FUTURO: Se o texto mencionar "Saldo Parcelado em Faturas Futuras" ou similar com um valor,
   capture em declared_future_installments. Se não estiver neste trecho, retorne null.

partial_total: soma de todos os amounts POSITIVOS (despesas) presentes neste trecho.

Valores: separador decimal é ponto. Converta vírgulas para ponto.
Datas: YYYY-MM-DD. Sem ano, use o ano da fatura inferido do contexto ou o ano atual.
confidence: 1.0 se data+valor+descrição claramente legíveis. Reduza para ambiguidades de OCR.
Se não houver nenhuma transação neste trecho, retorne lista vazia, partial_total: 0.
Responda APENAS com o JSON, sem texto antes ou depois, sem blocos de markdown.`;

export const extractBatchFn = createServerFn({ method: "POST" })
  .validator((data: BatchInput) => data)
  .handler(async ({ data }): Promise<BatchResult> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada no servidor.");

    const client = new Anthropic({ apiKey });

    const userMessage =
      data.totalBatches > 1
        ? `Arquivo: ${data.filename}\nTrecho ${data.batchIndex + 1} de ${data.totalBatches}:\n---\n${data.batchText.slice(0, 80_000)}\n---`
        : `Arquivo: ${data.filename}\nTexto extraído do PDF:\n---\n${data.batchText.slice(0, 80_000)}\n---`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16_000,
      messages: [{ role: "user", content: userMessage }],
      system: SYSTEM_PROMPT,
    });

    const stoppedEarly = message.stop_reason === "max_tokens";

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonStart = rawText.search(/[{[]/);
    const jsonEnd = Math.max(rawText.lastIndexOf("}"), rawText.lastIndexOf("]"));
    const jsonStr =
      jsonStart !== -1 && jsonEnd > jsonStart
        ? rawText.slice(jsonStart, jsonEnd + 1)
        : rawText.trim();

    let parsed: Omit<BatchResult, "stopped_early">;
    try {
      parsed = JSON.parse(jsonStr) as Omit<BatchResult, "stopped_early">;
    } catch (parseErr) {
      console.error(`[AI] batch ${data.batchIndex + 1} JSON.parse failed:`, parseErr);
      throw new Error(
        "A IA não conseguiu interpretar este trecho do PDF. Tente importar novamente.",
      );
    }

    if (!Array.isArray(parsed.transactions)) {
      throw new Error("A IA retornou uma resposta inesperada para este trecho.");
    }

    return { ...parsed, stopped_early: stoppedEarly };
  });
