import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, CreditCard, Gift, QrCode } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { applyPromoCode, type CommercialSubscription } from "@/lib/commercial/access";
import { createAsaasCheckoutFn } from "@/lib/commercial/asaas";

type BillingCycle = "monthly" | "annual";

const CYCLE_PRICE_CENTS: Record<BillingCycle, number> = {
  monthly: 2290, // R$22,90/mês
  annual: 23990, // R$239,90/ano
};

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Mensal",
  annual: "Anual",
};

const STATUS_LABEL: Record<string, string> = {
  trial_active: "Teste grátis",
  trial_expired: "Teste expirado",
  awaiting_pix_confirmation: "Aguardando confirmação do Pix",
  active_paid: "Assinatura ativa",
  payment_overdue: "Pagamento atrasado",
  blocked_readonly: "Acesso bloqueado (somente leitura)",
};

const PLAN_LABEL: Record<string, string> = {
  trial: "Teste grátis",
  individual: "Individual",
  family: "Família",
  internal: "Interno",
};

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

type MyPlanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  subscription: CommercialSubscription;
};

export function MyPlanDialog({ open, onOpenChange, orgId, subscription }: MyPlanDialogProps) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [appliedMessage, setAppliedMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86_400_000),
  );
  const basePriceCents = CYCLE_PRICE_CENTS[billingCycle];
  const checkoutAmountCents = subscription.amount_cents ?? basePriceCents;
  const canUpgrade = subscription.plan_name === "trial" || subscription.status === "trial_expired";

  const promoMutation = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("Informe o código promocional.");
      return applyPromoCode(orgId, code, basePriceCents);
    },
    onSuccess: async (result) => {
      setAppliedMessage(
        `${result.code} aplicado: ${formatCents(result.discount_amount_cents)} de desconto. Valor anual com desconto: ${formatCents(result.final_amount_cents)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["commercial-subscription", orgId] });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      setCheckoutError("");
      return createAsaasCheckoutFn({
        data: {
          orgId,
          amountCents: checkoutAmountCents,
          planLabel: `Ticlio Família — ${CYCLE_LABEL[billingCycle].toLowerCase()}`,
          billingCycle,
        },
      });
    },
    onSuccess: (result) => {
      window.location.href = result.link;
    },
    onError: (err) => {
      setCheckoutError(err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meu plano</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-950">
              {PLAN_LABEL[subscription.plan_name] ?? subscription.plan_name}
            </p>
            <p className="text-muted-foreground">
              {STATUS_LABEL[subscription.status] ?? subscription.status}
            </p>
            {subscription.plan_name === "trial" ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <Clock className="h-3.5 w-3.5" />
                {daysLeft} dia(s) restantes de teste
              </p>
            ) : null}
            {subscription.status === "active_paid" && subscription.paid_until ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Válido até {new Date(subscription.paid_until).toLocaleDateString("pt-BR")}
              </p>
            ) : null}
          </div>

          {canUpgrade ? (
            <>
              <ToggleGroup
                type="single"
                value={billingCycle}
                onValueChange={(value) => {
                  if (value) setBillingCycle(value as BillingCycle);
                }}
                className="grid grid-cols-2 gap-2"
              >
                <ToggleGroupItem
                  value="monthly"
                  className="flex-col gap-0.5 rounded-xl border border-slate-200 py-3 data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                >
                  <span className="text-xs font-medium text-muted-foreground">Mensal</span>
                  <span className="font-semibold text-slate-950">
                    {formatCents(CYCLE_PRICE_CENTS.monthly)}/mês
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="annual"
                  className="flex-col gap-0.5 rounded-xl border border-slate-200 py-3 data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                >
                  <span className="text-xs font-medium text-muted-foreground">Anual</span>
                  <span className="font-semibold text-slate-950">
                    {formatCents(CYCLE_PRICE_CENTS.annual)}/ano
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>

              <div className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label className="text-xs font-medium">Código promocional, se tiver</Label>
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    placeholder="Digite seu código"
                    className="mt-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={promoMutation.isPending || !code.trim()}
                  onClick={() => promoMutation.mutate()}
                >
                  <Gift className="mr-2 h-4 w-4" />
                  Aplicar
                </Button>
                {appliedMessage ? (
                  <p className="text-xs font-medium text-emerald-700 sm:col-span-2">
                    {appliedMessage}
                  </p>
                ) : null}
                {promoMutation.error ? (
                  <p className="text-xs text-red-700 sm:col-span-2">
                    {promoMutation.error instanceof Error
                      ? promoMutation.error.message
                      : String(promoMutation.error)}
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-950">
                  Plano Família {CYCLE_LABEL[billingCycle].toLowerCase()} ·{" "}
                  {formatCents(checkoutAmountCents)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Libera membros, workspaces adicionais e os recursos premium do beta.{" "}
                  {billingCycle === "monthly"
                    ? "Cobrança recorrente no cartão, renovada automaticamente todo mês."
                    : "Pagamento via Pix, direto na página segura da Asaas."}
                </p>
                {checkoutError ? (
                  <p className="mt-2 text-xs text-red-700">{checkoutError}</p>
                ) : null}
                <Button
                  type="button"
                  className="mt-3 w-full"
                  disabled={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate()}
                >
                  {billingCycle === "monthly" ? (
                    <CreditCard className="mr-2 h-4 w-4" />
                  ) : (
                    <QrCode className="mr-2 h-4 w-4" />
                  )}
                  {checkoutMutation.isPending ? "Abrindo pagamento…" : "Assinar plano"}
                </Button>
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
