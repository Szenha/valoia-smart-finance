import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/lib/supabase/admin";

const APP_URL = "https://ticlio.com.br";

type BillingCycle = "monthly" | "annual";
type ChargeMode = "recurring" | "one_time";

type CreateCheckoutInput = {
  orgId: string;
  billingCycle: BillingCycle;
  chargeMode: ChargeMode;
};

type AsaasCheckoutResponse = {
  id: string;
  link: string;
  status: string;
};

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "mensal",
  annual: "anual",
};

export function asaasBaseUrl(): string {
  return process.env.ASAAS_ENV === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";
}

// Obrigatório pela Asaas em toda chamada — o fetch do Worker não manda um
// default, e sem isso toda requisição volta 400 (user_agent_not_informed).
export const ASAAS_USER_AGENT = "Ticlio/1.0 (Cloudflare Workers)";

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export const createAsaasCheckoutFn = createServerFn({ method: "POST" })
  .validator((data: CreateCheckoutInput) => data)
  .handler(async ({ data }): Promise<{ link: string }> => {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");
    if (!data.orgId) throw new Error("Workspace inválido.");
    if (data.billingCycle !== "monthly" && data.billingCycle !== "annual") {
      throw new Error("Ciclo de cobrança inválido.");
    }
    if (data.chargeMode !== "recurring" && data.chargeMode !== "one_time") {
      throw new Error("Forma de cobrança inválida.");
    }

    // Preço vem sempre do servidor — nunca do valor que o cliente mandar.
    // Isso é o que garante que ninguém contrate por um valor diferente do
    // preço de tabela (ou do desconto já registrado na assinatura).
    const admin = supabaseAdmin();

    const { data: pricing, error: pricingError } = await admin
      .from("commercial_pricing")
      .select("price_cents, active")
      .eq("billing_cycle", data.billingCycle)
      .maybeSingle();
    if (pricingError) throw new Error(`Falha ao buscar preço: ${pricingError.message}`);
    if (!pricing || !pricing.active) {
      throw new Error("Este ciclo de cobrança não está disponível no momento.");
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("commercial_subscriptions")
      .select("discount_percent")
      .eq("organization_id", data.orgId)
      .maybeSingle();
    if (subscriptionError) {
      throw new Error(`Falha ao buscar assinatura: ${subscriptionError.message}`);
    }

    const discountPercent = subscription?.discount_percent ?? 0;
    const amountCents = Math.max(Math.round(pricing.price_cents * (1 - discountPercent / 100)), 0);
    if (amountCents <= 0) throw new Error("Valor calculado inválido.");

    // Pix não suporta cobrança recorrente na Asaas — "recorrente" só existe
    // no cartão. "Avulso" oferece Pix e cartão juntos na mesma tela.
    const isRecurring = data.chargeMode === "recurring";
    const cycleLabel = CYCLE_LABEL[data.billingCycle];
    const modeLabel = isRecurring ? "cobrança automática no cartão" : "pagamento avulso";

    const response = await fetch(`${asaasBaseUrl()}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ASAAS_USER_AGENT,
        access_token: apiKey,
      },
      body: JSON.stringify({
        billingTypes: isRecurring ? ["CREDIT_CARD"] : ["PIX", "CREDIT_CARD"],
        chargeTypes: isRecurring ? ["RECURRENT"] : ["DETACHED"],
        minutesToExpire: 60,
        // orgId e ciclo de cobrança viajam juntos aqui porque é o único dado
        // que a Asaas devolve inalterado no payload do webhook de confirmação.
        externalReference: `${data.orgId}:${data.billingCycle}`,
        callback: {
          successUrl: `${APP_URL}/?checkout=sucesso`,
          cancelUrl: `${APP_URL}/?checkout=cancelado`,
          expiredUrl: `${APP_URL}/?checkout=expirado`,
        },
        items: [
          {
            name: `Ticlio Família — ${cycleLabel} (${modeLabel})`,
            description: `Assinatura ${cycleLabel} Ticlio`,
            quantity: 1,
            value: Number((amountCents / 100).toFixed(2)),
          },
        ],
        ...(isRecurring
          ? {
              subscription: {
                cycle: data.billingCycle === "monthly" ? "MONTHLY" : "YEARLY",
                nextDueDate: todayDateOnly(),
              },
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Falha ao criar checkout na Asaas: ${response.status} ${errorText}`);
    }

    const parsed = (await response.json()) as AsaasCheckoutResponse;
    if (!parsed.link) throw new Error("A Asaas não retornou o link de checkout.");
    return { link: parsed.link };
  });
