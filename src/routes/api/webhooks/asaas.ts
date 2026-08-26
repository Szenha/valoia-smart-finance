import { createFileRoute } from "@tanstack/react-router";
import { asaasBaseUrl } from "@/lib/commercial/asaas";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PAID_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

type AsaasWebhookPayload = {
  event?: string;
  payment?: {
    id?: string;
    externalReference?: string;
    subscription?: string;
  };
};

// Cobranças geradas automaticamente por uma assinatura recorrente (cartão
// mensal) nem sempre repetem o externalReference do checkout original no
// próprio payment — buscamos na assinatura como rede de segurança.
async function resolveExternalReference(payment: {
  externalReference?: string;
  subscription?: string;
}): Promise<string | null> {
  if (payment.externalReference) return payment.externalReference;
  if (!payment.subscription) return null;

  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`${asaasBaseUrl()}/subscriptions/${payment.subscription}`, {
    headers: { access_token: apiKey },
  });
  if (!response.ok) return null;

  const subscription = (await response.json()) as { externalReference?: string };
  return subscription.externalReference ?? null;
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

        const payment = event.payment;
        console.info("Evento Asaas recebido:", event.event, payment?.id);

        if (!event.event || !PAID_EVENTS.has(event.event) || !payment) {
          return new Response(null, { status: 200 });
        }

        const reference = await resolveExternalReference(payment);
        if (!reference) {
          return new Response(null, { status: 200 });
        }

        const [orgId, billingCycle] = reference.split(":");
        if (!orgId) {
          return new Response(null, { status: 200 });
        }

        const admin = supabaseAdmin();

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

        const { error: updateError } = await admin
          .from("commercial_subscriptions")
          .update({
            // Preserva o plano definido por um código promocional (ex.: individual);
            // sem promo aplicado o único produto vendido hoje é o Família.
            plan_name: existing && existing.plan_name !== "trial" ? existing.plan_name : "family",
            status: "active_paid",
            paid_until: paidUntil.toISOString(),
            payment_confirmed_at: new Date().toISOString(),
            pix_reference: payment.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", orgId);

        if (updateError) {
          console.error("Falha ao atualizar assinatura via webhook Asaas:", updateError.message);
          return new Response("Erro interno.", { status: 500 });
        }

        return new Response(null, { status: 200 });
      },
    },
  },
});
