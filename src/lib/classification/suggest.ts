import { supabase } from "@/lib/supabase/client";
import { classifyWithAIFn, normalizeDescription, type CategoryRow } from "./ai";

export type CategorySuggestion = {
  category_id: string | null;
  method: "memoria_exata" | "regra_similaridade" | "ia" | null;
  confidence: number | null;
};

export async function suggestCategoryForDescription(
  orgId: string,
  description: string,
  amount: number,
  accountKind: string,
  categories: CategoryRow[],
): Promise<CategorySuggestion> {
  const normalized = normalizeDescription(description);
  if (!normalized) return { category_id: null, method: null, confidence: null };

  // Only leaves may receive a classification — a category with subcategories
  // is an aggregate and must never be assigned directly.
  const leafIds = new Set(categories.map((category) => category.id));

  const { data: exact } = await supabase
    .from("classification_memory")
    .select("category_id, confidence")
    .eq("organization_id", orgId)
    .eq("pattern", normalized)
    .maybeSingle();

  if (exact && leafIds.has(exact.category_id as string)) {
    return {
      category_id: exact.category_id as string,
      method: "memoria_exata",
      confidence: Number(exact.confidence),
    };
  }

  const { data: similar } = await supabase.rpc("find_classification", {
    p_org_id: orgId,
    p_pattern: normalized,
    p_min_similarity: 0.6,
  });
  const best = (similar as { category_id: string; sim: number }[] | null)?.find((row) =>
    leafIds.has(row.category_id),
  );
  if (best) {
    return {
      category_id: best.category_id,
      method: "regra_similaridade",
      confidence: best.sim,
    };
  }

  if (categories.length === 0) return { category_id: null, method: null, confidence: null };
  const [ai] = await classifyWithAIFn({
    data: {
      transactions: [
        {
          id: "draft",
          description,
          amount,
          account_kind: accountKind,
          normalized,
        },
      ],
      categories,
    },
  });

  return {
    category_id: ai?.category_id ?? null,
    method: "ia",
    confidence: ai?.confidence ?? null,
  };
}
