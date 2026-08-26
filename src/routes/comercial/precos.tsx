import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  BILLING_CYCLE_LABEL,
  fetchCommercialPricing,
  TICLIO_STAFF_EMAIL,
  updateCommercialPricing,
  type BillingCycle,
  type CommercialPricing,
} from "@/lib/commercial/access";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/comercial/precos")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
    if (user.email !== TICLIO_STAFF_EMAIL) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Comercial · Planos e preços" }] }),
  component: PricingRoute,
});

function formatCentsInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function PricingRoute() {
  const queryClient = useQueryClient();
  const pricingQuery = useQuery({
    queryKey: ["commercial-pricing"],
    queryFn: fetchCommercialPricing,
  });

  const rows = pricingQuery.data ?? [];
  const monthly = rows.find((row) => row.billing_cycle === "monthly");
  const annual = rows.find((row) => row.billing_cycle === "annual");
  const savingsCents =
    monthly && annual ? Math.max(monthly.price_cents * 12 - annual.price_cents, 0) : 0;

  return (
    <AppShell activeSection="comercial" title="Planos e preços" subtitle="Preço de tabela vigente">
      {pricingQuery.isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {monthly ? (
            <PricingCard
              row={monthly}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["commercial-pricing"] })}
            />
          ) : null}
          {annual ? (
            <PricingCard
              row={annual}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["commercial-pricing"] })}
              hint={
                savingsCents > 0
                  ? `Economia de ${formatCents(savingsCents)} em relação a 12 mensalidades no preço atual.`
                  : undefined
              }
            />
          ) : null}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Alterar o preço aqui afeta só novas contratações — assinaturas já pagas mantêm o valor
        contratado na época, registrado em cada assinatura.
      </p>
    </AppShell>
  );
}

function PricingCard({
  row,
  onSaved,
  hint,
}: {
  row: CommercialPricing;
  onSaved: () => void;
  hint?: string;
}) {
  const [priceInput, setPriceInput] = useState(formatCentsInput(row.price_cents));
  const [active, setActive] = useState(row.active);
  const [error, setError] = useState("");

  useEffect(() => {
    setPriceInput(formatCentsInput(row.price_cents));
    setActive(row.active);
  }, [row.price_cents, row.active]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cents = parseCurrencyToCents(priceInput);
      if (!cents) throw new Error("Informe um preço válido.");
      await updateCommercialPricing(row.billing_cycle as BillingCycle, cents, active);
    },
    onSuccess: () => {
      setError("");
      onSaved();
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{BILLING_CYCLE_LABEL[row.billing_cycle]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs font-medium">Preço</Label>
          <Input
            value={priceInput}
            onChange={(event) => setPriceInput(event.target.value)}
            placeholder="22,90"
            inputMode="decimal"
            className="mt-1"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <Label className="text-sm font-medium">Disponível para novas contratações</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        {hint ? <p className="text-xs text-emerald-700">{hint}</p> : null}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        <Button
          type="button"
          className="w-full"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}
