import { createFileRoute } from "@tanstack/react-router";

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

        let event: { event?: string; payment?: Record<string, unknown> };
        try {
          event = await request.json();
        } catch {
          return new Response("Payload inválido.", { status: 400 });
        }

        // TODO: tratar eventos (ex.: PAYMENT_CONFIRMED) para liberar a assinatura comercial.
        console.info("Evento Asaas recebido:", event.event, event.payment?.id);

        return new Response(null, { status: 200 });
      },
    },
  },
});
