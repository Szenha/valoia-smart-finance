// Client-side classification pipeline.
// All functions here use the browser Supabase client and run in the browser.
// Layer 3 (AI) delegates to the classifyWithAIFn server function.

import { supabase } from "@/lib/supabase/client";
import {
  classifyWithAIFn,
  normalizeDescription,
  type CategoryRow,
  type ClassificationResult,
} from "./ai";

export type { CategoryRow, ClassificationResult };
export { normalizeDescription };

// ── Default categories ─────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: { name: string; type: "income" | "expense" | "transfer" }[] = [
  { name: "Supermercado", type: "expense" },
  { name: "Farmácia", type: "expense" },
  { name: "Restaurante", type: "expense" },
  { name: "Transporte", type: "expense" },
  { name: "Moradia", type: "expense" },
  { name: "Saúde", type: "expense" },
  { name: "Educação", type: "expense" },
  { name: "Lazer", type: "expense" },
  { name: "Vestuário", type: "expense" },
  { name: "Serviços e Assinaturas", type: "expense" },
  { name: "Salário", type: "income" },
  { name: "Rendimentos", type: "income" },
  { name: "Transferência", type: "transfer" },
];

/**
 * Returns existing categories for the org, or seeds the defaults and returns them.
 */
export async function ensureDefaultCategories(orgId: string): Promise<CategoryRow[]> {
  const { data: existing } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("organization_id", orgId);

  if (existing && existing.length > 0) return existing as CategoryRow[];

  const { data: inserted } = await supabase
    .from("categories")
    .insert(DEFAULT_CATEGORIES.map((c) => ({ ...c, organization_id: orgId })))
    .select("id, name, type");

  return (inserted ?? []) as CategoryRow[];
}

// ── Full 3-layer pipeline ──────────────────────────────────────────────────

/**
 * Classifies all transactions with `category_id IS NULL` for the org.
 * Layer 1 → exact pattern match in memory
 * Layer 2 → pg_trgm similarity (via Supabase RPC)
 * Layer 3 → AI (claude-sonnet-4-6), batched in chunks of 30
 *
 * @param setStatus optional callback for progress messages shown in the UI
 */
export async function runClassificationPipeline(
  orgId: string,
  categories: CategoryRow[],
  setStatus?: (msg: string) => void,
): Promise<{ classified: number; needsReview: number }> {
  // 1. Fetch all unclassified transactions
  const { data: txns } = await supabase
    .from("transactions")
    .select("id, description, amount, account_kind")
    .eq("organization_id", orgId)
    .is("category_id", null)
    .limit(500);

  if (!txns || txns.length === 0) return { classified: 0, needsReview: 0 };

  setStatus?.(`Classificando ${txns.length} transação(ões)…`);

  // 2. Load full memory for this org (used for Layer 1 in-memory lookup)
  const { data: memory } = await supabase
    .from("classification_memory")
    .select("pattern, category_id, confidence")
    .eq("organization_id", orgId);

  const memoryMap = new Map(
    (memory ?? []).map((m) => [
      m.pattern as string,
      m as { pattern: string; category_id: string; confidence: number },
    ]),
  );

  const results: ClassificationResult[] = [];
  const afterLayer1: typeof txns = [];
  const normalizedById = new Map<string, string>();

  // ── Layer 1: exact match (O(1) per transaction, in-memory) ────────────
  for (const txn of txns) {
    const norm = normalizeDescription(txn.description);
    normalizedById.set(txn.id, norm);
    const hit = memoryMap.get(norm);
    if (hit) {
      results.push({
        id: txn.id,
        category_id: hit.category_id,
        method: "memoria_exata",
        confidence: Number(hit.confidence),
        needs_review: false,
      });
    } else {
      afterLayer1.push(txn);
    }
  }

  // ── Layer 2: pg_trgm similarity (parallel RPC calls) ─────────────────
  const forAI: typeof txns = [];

  if (afterLayer1.length > 0) {
    setStatus?.(`Buscando similaridade para ${afterLayer1.length} transação(ões)…`);

    const layer2 = await Promise.all(
      afterLayer1.map(async (txn) => {
        const normalized = normalizedById.get(txn.id)!;
        const { data } = await supabase.rpc("find_classification", {
          p_org_id: orgId,
          p_pattern: normalized,
          p_min_similarity: 0.6,
        });
        const best = (data as { category_id: string; sim: number }[] | null)?.[0] ?? null;
        return { txn, best };
      }),
    );

    for (const { txn, best } of layer2) {
      if (best) {
        results.push({
          id: txn.id,
          category_id: best.category_id,
          method: "regra_similaridade",
          confidence: best.sim,
          needs_review: best.sim < 0.85,
        });
      } else {
        forAI.push(txn);
      }
    }
  }

  // ── Layer 3: AI in chunks of 30 ────────────────────────────────────────
  if (forAI.length > 0 && categories.length > 0) {
    const CHUNK = 30;
    for (let i = 0; i < forAI.length; i += CHUNK) {
      const chunk = forAI.slice(i, i + CHUNK);
      setStatus?.(
        `Classificando com IA: ${i + 1}–${Math.min(i + CHUNK, forAI.length)} de ${forAI.length}…`,
      );
      try {
        const aiResults = await classifyWithAIFn({
          data: {
            transactions: chunk.map((t) => ({
              id: t.id,
              description: t.description,
              amount: t.amount,
              account_kind: t.account_kind,
              normalized: normalizedById.get(t.id)!,
            })),
            categories,
          },
        });
        results.push(...aiResults);
      } catch {
        // AI failed — mark entire chunk as needs_review
        results.push(
          ...chunk.map(
            (t): ClassificationResult => ({
              id: t.id,
              category_id: null,
              method: "ia",
              confidence: null,
              needs_review: true,
            }),
          ),
        );
      }
    }
  } else if (forAI.length > 0) {
    results.push(
      ...forAI.map(
        (t): ClassificationResult => ({
          id: t.id,
          category_id: null,
          method: null,
          confidence: null,
          needs_review: true,
        }),
      ),
    );
  }

  // ── Apply results to DB ────────────────────────────────────────────────
  await Promise.all(
    results.map((r) =>
      supabase
        .from("transactions")
        .update({
          category_id: r.category_id,
          classification_method: r.method,
          classification_confidence: r.confidence,
          needs_review: r.needs_review,
        })
        .eq("id", r.id)
        .eq("organization_id", orgId),
    ),
  );

  const classified = results.filter((r) => r.category_id !== null).length;
  const needsReview = results.filter((r) => r.needs_review).length;
  return { classified, needsReview };
}

// ── Learning from manual confirmation ─────────────────────────────────────

/**
 * Called when the user manually confirms or corrects a category.
 * Updates classification_memory (upsert) and marks the transaction as
 * manually classified.
 */
export async function learnFromConfirmation(
  orgId: string,
  txnId: string,
  description: string,
  categoryId: string,
): Promise<void> {
  const pattern = normalizeDescription(description);

  // Update the transaction first
  await supabase
    .from("transactions")
    .update({
      category_id: categoryId,
      classification_method: "manual",
      classification_confidence: 1.0,
      needs_review: false,
    })
    .eq("id", txnId);

  // Upsert classification memory
  const { data: existing } = await supabase
    .from("classification_memory")
    .select("id, match_count")
    .eq("organization_id", orgId)
    .eq("pattern", pattern)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("classification_memory")
      .update({
        category_id: categoryId,
        confidence: 1.0,
        match_count: (existing.match_count as number) + 1,
        last_matched_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("classification_memory").insert({
      organization_id: orgId,
      pattern,
      category_id: categoryId,
      confidence: 1.0,
      match_count: 1,
      last_matched_at: new Date().toISOString(),
    });
  }
}
