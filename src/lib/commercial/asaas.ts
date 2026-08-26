import { createServerFn } from "@tanstack/react-start";

const APP_URL = "https://ticlio.com.br";

type CreateCheckoutInput = {
  orgId: string;
  amountCents: number;
  planLabel: string;
  billingCycle: "monthly" | "annual";
};

type AsaasCheckoutResponse = {
  id: string;
  link: string;
  status: string;
};

export function asaasBaseUrl(): string {
  return process.env.ASAAS_ENV === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export const createAsaasCheckoutFn = createServerFn({ method: "POST" })
  .validator((data: CreateCheckoutInput) => data)
  .handler(async ({ data }): Promise<{ link: string }> => {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");
    if (!data.orgId) throw new Error("Workspace inválido.");
    if (!data.amountCents || data.amountCents <= 0) throw new Error("Valor inválido.");

    // Anual segue Pix à vista. Mensal vira assinatura recorrente no cartão —
    // Pix não suporta cobrança recorrente automática na Asaas.
    const isMonthly = data.billingCycle === "monthly";

    const response = await fetch(`${asaasBaseUrl()}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: apiKey,
      },
      body: JSON.stringify({
        billingTypes: isMonthly ? ["CREDIT_CARD"] : ["PIX"],
        chargeTypes: isMonthly ? ["RECURRENT"] : ["DETACHED"],
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
            name: data.planLabel,
            description: isMonthly ? "Assinatura mensal Ticlio" : "Assinatura anual Ticlio",
            quantity: 1,
            value: Number((data.amountCents / 100).toFixed(2)),
          },
        ],
        ...(isMonthly
          ? {
              subscription: {
                cycle: "MONTHLY",
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
