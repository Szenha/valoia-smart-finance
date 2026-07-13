import { createServerFn } from "@tanstack/react-start";
import Anthropic from "@anthropic-ai/sdk";

// ── Types (shared with pipeline.ts) ───────────────────────────────────────

export type CategoryRow = { id: string; name: string; type: string };

export type ClassificationResult = {
  id: string;
  category_id: string | null;
  method: "memoria_exata" | "regra_similaridade" | "ia" | "manual" | null;
  confidence: number | null;
  needs_review: boolean;
};

// ── Pure helper (safe to use anywhere) ────────────────────────────────────

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/\bpar[c]?\s*\d+\/\d+\b/gi, "") // remove PARC XX/YY
    .replace(/\d{2}\/\d{2}\/\d{2,4}/g, "") // remove dates
    .replace(/\s+/g, " ")
    .trim();
}

// ── AI classification server function (Layer 3) ───────────────────────────

type AIClassifyInput = {
  transactions: {
    id: string;
    description: string;
    amount: number;
    account_kind: string;
    normalized: string;
  }[];
  categories: CategoryRow[];
};

const CATEGORY_TYPE_LABEL: Record<string, string> = {
  expense: "despesa",
  income: "receita",
  transfer: "transferência",
};

export const classifyWithAIFn = createServerFn({ method: "POST" })
  .validator((data: AIClassifyInput) => data)
  .handler(async ({ data }): Promise<ClassificationResult[]> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
    const client = new Anthropic({ apiKey });

    const categoryList = data.categories
      .map((c, i) => `${i}. "${c.name}" (${CATEGORY_TYPE_LABEL[c.type] ?? c.type})`)
      .join("\n");

    const txnList = data.transactions
      .map(
        (t, i) =>
          `${i}. "${t.normalized}" | R$ ${Math.abs(t.amount).toFixed(2)} | ${
            t.account_kind === "credit_card" ? "cartão de crédito" : "conta corrente"
          }`,
      )
      .join("\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Você é um classificador de transações financeiras brasileiras.

Categorias disponíveis:
${categoryList}

Transações para classificar:
${txnList}

Responda APENAS com um array JSON. Para cada transação, escolha a categoria mais adequada da lista acima:
[{"idx": 0, "category_name": "Supermercado", "confidence": 0.95}, ...]

Regras:
- confidence entre 0 e 1 (1 = certeza total)
- confidence < 0.7 se a categoria não for clara
- category_name deve ser exatamente o nome de uma das categorias listadas
- Se nenhuma categoria se encaixar, retorne category_name: null
- Não inclua texto fora do JSON`,
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const arrStart = rawText.indexOf("[");
    const arrEnd = rawText.lastIndexOf("]");
    if (arrStart === -1 || arrEnd === -1) return _allNeedsReview(data.transactions);

    let aiRows: { idx: number; category_name: string | null; confidence: number }[];
    try {
      aiRows = JSON.parse(rawText.slice(arrStart, arrEnd + 1));
    } catch {
      return _allNeedsReview(data.transactions);
    }

    return data.transactions.map((txn, i) => {
      const ai = aiRows.find((r) => r.idx === i);
      if (!ai || !ai.category_name) {
        return {
          id: txn.id,
          category_id: null,
          method: "ia",
          confidence: null,
          needs_review: true,
        };
      }
      const cat = data.categories.find(
        (c) => c.name.toLowerCase() === ai.category_name!.toLowerCase(),
      );
      return {
        id: txn.id,
        category_id: cat?.id ?? null,
        method: "ia" as const,
        confidence: ai.confidence,
        needs_review: !cat || ai.confidence < 0.8,
      };
    });
  });

function _allNeedsReview(txns: { id: string }[]): ClassificationResult[] {
  return txns.map((t) => ({
    id: t.id,
    category_id: null,
    method: "ia" as const,
    confidence: null,
    needs_review: true,
  }));
}
