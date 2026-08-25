import { supabase } from "@/lib/supabase/client";

export type AiUsageKind = "voice" | "text";

const DAILY_AI_LIMIT = 10;

export async function consumeAiDailyAllowance(
  organizationId: string,
  operation: AiUsageKind,
): Promise<void> {
  const { data, error } = await supabase.rpc("consume_ai_daily_allowance", {
    p_org_id: organizationId,
    p_operation: operation,
    p_daily_limit: DAILY_AI_LIMIT,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) {
    throw new Error(
      "O registro por IA não está disponível agora. Você ainda pode lançar manualmente.",
    );
  }
}
