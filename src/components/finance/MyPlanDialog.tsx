import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  applyPromoCode,
  fetchCommercialPricing,
  BILLING_CYCLE_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  type BillingCycle,
  type CommercialSubscription,
} from "@/lib/commercial/access";
import { createAsaasCheckoutFn } from "@/lib/commercial/asaas";

type ChargeMode = "one_time" | "recurring";

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
  const [chargeMode, setChargeMode] = useState<ChargeMode>("one_time");

  const pricingQuery = useQuery({
    queryKey: ["commercial-pricing"],
    enabled: open,
    queryFn: fetchCommercialPricing,
  });
  const monthlyPricing = pricingQuery.data?.find((row) => row.billing_cycle === "monthly");
  const annualPricing = pricingQuery.data?.find((row) => row.billing_cycle === "annual");
  const savingsCents =
    monthlyPricing && annualPricing
      ? Math.max(monthlyPricing.price_cents * 12 - annualPricing.price_cents, 0)
      : 0;

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86_400_000),
  );
  const basePriceCents =
    (billingCycle === "monthly" ? monthlyPricing : annualPricing)?.price_cents ?? 0;
  const discountPercent = subscription.discount_percent ?? 0;
  const checkoutAmountCents = Math.round(basePriceCents * (1 - discountPercent / 100));
  const canUpgrade =
    subscription.plan_name === "trial" ||
    subscription.status === "trial_expired" ||
    subscription.status === "payment_overdue" ||
    subscription.status === "cancelled";

  const promoMutation = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("Informe o código promocional.");
      return applyPromoCode(orgId, code, billingCycle);
    },
    onSuccess: async (result) => {
      setAppliedMessage(
        `${result.code} aplicado: ${formatCents(result.discount_amount_cents)} de desconto. Valor com desconto: ${formatCents(result.final_amount_cents)}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["commercial-subscription", orgId] });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      setCheckoutError("");
      return createAsaasCheckoutFn({
        data: { orgId, billingCycle, chargeMode },
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
              {SUBSCRIPTION_STATUS_LABEL[subscription.status] ?? subscription.status}
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
                    {monthlyPricing ? `${formatCents(monthlyPricing.price_cents)}/mês` : "…"}
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="annual"
                  className="flex-col gap-0.5 rounded-xl border border-slate-200 py-3 data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                >
                  <span className="text-xs font-medium text-muted-foreground">Anual</span>
                  <span className="font-semibold text-slate-950">
                    {annualPricing ? `${formatCents(annualPricing.price_cents)}/ano` : "…"}
                  </span>
                  {savingsCents > 0 ? (
                    <span className="text-[11px] font-medium text-emerald-700">
                      Economize {formatCents(savingsCents)}
                    </span>
                  ) : null}
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

              <div>
                <Label className="text-xs font-medium">Como prefere pagar?</Label>
                <ToggleGroup
                  type="single"
                  value={chargeMode}
                  onValueChange={(value) => {
                    if (value) setChargeMode(value as ChargeMode);
                  }}
                  className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  <ToggleGroupItem
                    value="one_time"
                    className="flex-col items-start gap-0.5 whitespace-normal rounded-xl border border-slate-200 p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                  >
                    <span className="font-medium text-slate-950">Pagamento avulso</span>
                    <span className="text-xs text-muted-foreground">
                      Pix ou cartão, você renova quando quiser
                    </span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="recurring"
                    className="flex-col items-start gap-0.5 whitespace-normal rounded-xl border border-slate-200 p-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/5"
                  >
                    <span className="font-medium text-slate-950">Cobrança automática</span>
                    <span className="text-xs text-muted-foreground">
                      No cartão, renova sozinho a cada período
                    </span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-950">
                  Plano Família {BILLING_CYCLE_LABEL[billingCycle].toLowerCase()} ·{" "}
                  {formatCents(checkoutAmountCents)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Libera membros, workspaces adicionais e os recursos premium do beta. Pix e cartão
                  são processados numa página segura da Asaas.
                </p>
                {checkoutError ? (
                  <p className="mt-2 text-xs text-red-700">{checkoutError}</p>
                ) : null}
                <Button
                  type="button"
                  className="mt-3 w-full"
                  disabled={checkoutMutation.isPending || !pricingQuery.data}
                  onClick={() => checkoutMutation.mutate()}
                >
                  {chargeMode === "recurring" ? (
                    <CreditCard className="mr-2 h-4 w-4" />
                  ) : (
                    <QrCode className="mr-2 h-4 w-4" />
                  )}
                  {checkoutMutation.isPending ? "Abrindo pagamento…" : "Continuar para pagamento"}
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
