import { createFileRoute } from "@tanstack/react-router";
import { asaasBaseUrl, ASAAS_USER_AGENT } from "@/lib/commercial/asaas";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PAID_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const CANCEL_EVENTS = new Set(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]);

type AsaasWebhookPayload = {
  event?: string;
  payment?: {
    id?: string;
    externalReference?: string;
    subscription?: string;
    billingType?: string;
    value?: number;
    customer?: string;
  };
  subscription?: {
    id?: string;
    externalReference?: string;
  };
};

type AsaasSubscriptionInfo = {
  externalReference?: string;
  nextDueDate?: string;
};

// Cobranças geradas automaticamente por uma assinatura recorrente (cartão)
// nem sempre repetem o externalReference do checkout original no próprio
// payment — buscamos na assinatura como rede de segurança. Também é daqui
// que vem a próxima data de cobrança, pro painel Comercial.
async function fetchAsaasSubscription(
  subscriptionId: string,
): Promise<AsaasSubscriptionInfo | null> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`${asaasBaseUrl()}/subscriptions/${subscriptionId}`, {
    headers: { access_token: apiKey, "User-Agent": ASAAS_USER_AGENT },
  });
  if (!response.ok) return null;

  return (await response.json()) as AsaasSubscriptionInfo;
}

function mapPaymentMethod(billingType?: string): "pix" | "credit_card" | null {
  if (billingType === "PIX") return "pix";
  if (billingType === "CREDIT_CARD") return "credit_card";
  return null;
}

export const Route = createFileRoute("/api/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
        if (!expectedToken) {
          console.error("ASAAS_WEBHOOK_TOKEN não configurado no servidor.");
          return new Response("Webhook não configurado.", { status: 500 });
        }

        const receivedToken = request.headers.get("asaas-access-token");
        if (!receivedToken || receivedToken !== expectedToken) {
          return new Response("Token inválido.", { status: 401 });
        }

        let event: AsaasWebhookPayload;
        try {
          event = await request.json();
        } catch {
          return new Response("Payload inválido.", { status: 400 });
        }

        console.info(
          "Evento Asaas recebido:",
          event.event,
          event.payment?.id ?? event.subscription?.id,
        );

        const admin = supabaseAdmin();

        if (event.event && PAID_EVENTS.has(event.event) && event.payment) {
          return handlePaymentConfirmed(admin, event.payment);
        }

        if (event.event && CANCEL_EVENTS.has(event.event) && event.subscription) {
          return handleSubscriptionCancelled(admin, event.subscription);
        }

        return new Response(null, { status: 200 });
      },
    },
  },
});

async function handlePaymentConfirmed(
  admin: ReturnType<typeof supabaseAdmin>,
  payment: NonNullable<AsaasWebhookPayload["payment"]>,
) {
  let reference = payment.externalReference ?? null;
  let subscriptionInfo: AsaasSubscriptionInfo | null = null;

  if (!reference && payment.subscription) {
    subscriptionInfo = await fetchAsaasSubscription(payment.subscription);
    reference = subscriptionInfo?.externalReference ?? null;
  }
  if (!reference) return new Response(null, { status: 200 });

  const [orgId, billingCycle] = reference.split(":");
  if (!orgId) return new Response(null, { status: 200 });

  const { data: existing, error: fetchError } = await admin
    .from("commercial_subscriptions")
    .select("plan_name, status, pix_reference")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (fetchError) {
    console.error("Falha ao buscar assinatura para webhook Asaas:", fetchError.message);
    return new Response("Erro interno.", { status: 500 });
  }

  // Idempotência: reentregas da Asaas para o mesmo pagamento já confirmado
  // não devem empurrar paid_until novamente para a frente.
  if (existing?.status === "active_paid" && existing.pix_reference === payment.id) {
    return new Response(null, { status: 200 });
  }

  const paidMonths = billingCycle === "monthly" ? 1 : 12;
  const paidUntil = new Date();
  paidUntil.setMonth(paidUntil.getMonth() + paidMonths);

  // Pra cobranças recorrentes buscamos a assinatura de novo (se ainda não
  // buscamos acima) só pra saber a próxima data de vencimento.
  if (payment.subscription && !subscriptionInfo) {
    subscriptionInfo = await fetchAsaasSubscription(payment.subscription);
  }

  // Valor efetivamente contratado = o que a Asaas realmente cobrou, nunca
  // um número vindo do checkout ou do preço de tabela atual.
  const amountCents = typeof payment.value === "number" ? Math.round(payment.value * 100) : null;

  const { error: updateError } = await admin
    .from("commercial_subscriptions")
    .update({
      // Preserva o plano definido por um código promocional (ex.: individual);
      // sem promo aplicado o único produto vendido hoje é o Família.
      plan_name: existing && existing.plan_name !== "trial" ? existing.plan_name : "family",
      status: "active_paid",
      billing_cycle: billingCycle === "monthly" || billingCycle === "annual" ? billingCycle : null,
      payment_method: mapPaymentMethod(payment.billingType),
      paid_until: paidUntil.toISOString(),
      next_due_date: subscriptionInfo?.nextDueDate ?? null,
      payment_confirmed_at: new Date().toISOString(),
      pix_reference: payment.id ?? null,
      asaas_customer_id: payment.customer ?? null,
      asaas_subscription_id: payment.subscription ?? null,
      cancelled_at: null,
      ...(amountCents !== null ? { amount_cents: amountCents } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("Falha ao atualizar assinatura via webhook Asaas:", updateError.message);
    return new Response("Erro interno.", { status: 500 });
  }

  return new Response(null, { status: 200 });
}

async function handleSubscriptionCancelled(
  admin: ReturnType<typeof supabaseAdmin>,
  subscription: NonNullable<AsaasWebhookPayload["subscription"]>,
) {
  const orgId = subscription.externalReference?.split(":")[0] ?? null;

  const query = admin.from("commercial_subscriptions").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const { error } = orgId
    ? await query.eq("organization_id", orgId)
    : subscription.id
      ? await query.eq("asaas_subscription_id", subscription.id)
      : { error: null };

  if (error) {
    console.error("Falha ao cancelar assinatura via webhook Asaas:", error.message);
    return new Response("Erro interno.", { status: 500 });
  }

  return new Response(null, { status: 200 });
}
