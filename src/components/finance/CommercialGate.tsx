import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, LockKeyhole } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  acceptRequiredLegalDocuments,
  applyPromoCode,
  capabilitiesFor,
  effectiveStatus,
  fetchCommercialSubscription,
  fetchLegalAcceptance,
  needsLegalAcceptance,
  normalizeSubscription,
  type CommercialSubscription,
  type PlanCapabilities,
} from "@/lib/commercial/access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type CommercialGateProps = {
  userId: string | null;
  orgId: string | null;
  children: (context: {
    subscription: CommercialSubscription;
    capabilities: PlanCapabilities;
  }) => ReactNode;
};

export function CommercialGate({ userId, orgId, children }: CommercialGateProps) {
  const queryClient = useQueryClient();

  const acceptanceQuery = useQuery({
    queryKey: ["legal-acceptance", userId],
    enabled: !!userId,
    queryFn: () => fetchLegalAcceptance(userId!),
  });

  const subscriptionQuery = useQuery({
    queryKey: ["commercial-subscription", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCommercialSubscription(orgId!),
  });

  const acceptMutation = useMutation({
    mutationFn: acceptRequiredLegalDocuments,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["legal-acceptance", userId] });
    },
  });

  if (!userId || !orgId || acceptanceQuery.isLoading || subscriptionQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando acesso…</div>;
  }

  if (needsLegalAcceptance(acceptanceQuery.data)) {
    return (
      <LegalAcceptanceCard
        busy={acceptMutation.isPending}
        error={acceptMutation.error}
        onAccept={() => acceptMutation.mutate()}
      />
    );
  }

  const subscription = normalizeSubscription(subscriptionQuery.data);
  const capabilities = capabilitiesFor(subscription);
  const status = effectiveStatus(subscription);

  return (
    <>
      {status === "trial_expired" ||
      status === "payment_overdue" ||
      status === "blocked_readonly" ? (
        <ReadonlyBanner subscription={subscription} />
      ) : status === "awaiting_pix_confirmation" ? (
        <AwaitingPaymentBanner subscription={subscription} />
      ) : status === "trial_active" && subscription.plan_name === "trial" ? (
        <TrialBanner orgId={orgId} subscription={subscription} />
      ) : null}
      {children({ subscription, capabilities })}
    </>
  );
}

function LegalAcceptanceCard({
  busy,
  error,
  onAccept,
}: {
  busy: boolean;
  error: unknown;
  onAccept: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-10">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <CardTitle>Antes de continuar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <p>
            O Ticlio lida com dados financeiros pessoais. Para liberar o acesso, confirme que você
            leu os documentos de beta e entende o uso de IA em recursos como voz, interpretação de
            texto e categorização.
          </p>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <AcceptanceRow href="/terms" label="Li e aceito os Termos de Uso." />
            <AcceptanceRow href="/privacy" label="Li a Política de Privacidade." />
            <AcceptanceRow href="/ai-notice" label="Entendo o aviso sobre uso de IA." />
          </div>
          <p className="text-xs text-muted-foreground">
            Estes textos são uma base operacional para o beta e ainda devem passar por revisão
            jurídica antes de venda em escala.
          </p>
          {error ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error instanceof Error ? error.message : String(error)}
            </p>
          ) : null}
          <Button type="button" disabled={busy} onClick={onAccept}>
            {busy ? "Salvando…" : "Aceitar e continuar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AcceptanceRow({ href, label }: { href: string; label: string }) {
  return (
    <label className="flex items-center gap-3">
      <Checkbox checked aria-hidden="true" />
      <span>
        {label}{" "}
        <Link to={href} className="font-medium text-primary hover:underline" target="_blank">
          Abrir documento
        </Link>
      </span>
    </label>
  );
}

function TrialBanner({
  orgId,
  subscription,
}: {
  orgId: string;
  subscription: CommercialSubscription;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [appliedMessage, setAppliedMessage] = useState("");
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86_400_000),
  );
  const promoMutation = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("Informe o código promocional.");
      return applyPromoCode(orgId, code);
    },
    onSuccess: async (result) => {
      setAppliedMessage(
        `${result.code} aplicado: ${formatCents(result.discount_amount_cents)} de desconto. Valor anual com desconto: ${formatCents(result.final_amount_cents)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["commercial-subscription", orgId] });
    },
  });

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-3">
          <p>
            Trial individual ativo. Você ainda tem <strong>{daysLeft} dia(s)</strong>. Recursos
            familiares e workspaces extras ficam disponíveis no plano Família.
          </p>
          {subscription.status === "awaiting_pix_confirmation" && subscription.promo_code ? (
            <p className="rounded-lg bg-white/70 px-3 py-2 text-xs">
              Código {subscription.promo_code} registrado. Aguarde a confirmação do Pix para liberar
              o plano pago.
            </p>
          ) : (
            <div className="grid gap-2 rounded-lg bg-white/70 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="text-xs font-medium">Código promocional</label>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="MARINA_VASCULAR"
                  className="mt-1 bg-white"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={promoMutation.isPending}
                onClick={() => promoMutation.mutate()}
              >
                Aplicar
              </Button>
            </div>
          )}
          {appliedMessage ? <p className="text-xs font-medium">{appliedMessage}</p> : null}
          {promoMutation.error ? (
            <p className="text-xs text-red-700">
              {promoMutation.error instanceof Error
                ? promoMutation.error.message
                : String(promoMutation.error)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AwaitingPaymentBanner({ subscription }: { subscription: CommercialSubscription }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Adesão anual aguardando confirmação por Pix
          {subscription.promo_code ? (
            <>
              {" "}
              com o código <strong>{subscription.promo_code}</strong>
            </>
          ) : null}
          . Valor registrado:{" "}
          <strong>
            {subscription.amount_cents ? formatCents(subscription.amount_cents) : "a confirmar"}
          </strong>
          .
        </p>
      </div>
    </div>
  );
}

function ReadonlyBanner({ subscription }: { subscription: CommercialSubscription }) {
  const overdue =
    effectiveStatus(subscription) === "trial_expired"
      ? "Seu trial terminou."
      : "Seu acesso pago precisa de regularização.";
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>{overdue}</strong> O app fica em modo leitura para preservar seus dados. Para
          continuar lançando e usando IA, solicite a liberação anual por Pix.
        </p>
      </div>
    </div>
  );
}

export function PremiumFeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center">
      <CheckCircle2 className="h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p>{description}</p>
      </div>
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
