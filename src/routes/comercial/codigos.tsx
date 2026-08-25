import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { WorkspaceGate } from "@/components/finance/WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchPromoCodes,
  savePromoCode,
  setPromoCodeActive,
  type PromoCode,
} from "@/lib/commercial/access";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/comercial/codigos")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Códigos promocionais" }] }),
  component: PromoCodesRoute,
});

type FormState = {
  code: string;
  description: string;
  discountPercent: string;
  appliesToPlan: "individual" | "family";
  annualPrice: string;
  active: "true" | "false";
  validUntil: string;
  maxRedemptions: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  description: "",
  discountPercent: "15",
  appliesToPlan: "family",
  annualPrice: "",
  active: "true",
  validUntil: "",
  maxRedemptions: "",
};

function PromoCodesRoute() {
  const queryClient = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const {
    orgId,
    organizations,
    error: orgError,
    refetchOrganizations,
  } = useActiveOrganization(currentUserId);
  const activeOrganization = organizations.find((org) => org.id === orgId) ?? null;
  const isAdmin = activeOrganization?.role === "admin";

  const promoCodesQuery = useQuery({
    queryKey: ["promo-codes", orgId],
    enabled: !!orgId && isAdmin,
    queryFn: () => fetchPromoCodes(orgId!),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !currentUserId) return;
      const discountPercent = Number(form.discountPercent.replace(",", "."));
      const annualPriceCents = parseCurrencyToCents(form.annualPrice);
      const maxRedemptions = form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null;
      if (!form.code.trim()) throw new Error("Informe o código promocional.");
      if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
        throw new Error("Informe um desconto entre 0,01% e 100%.");
      }
      if (!annualPriceCents) {
        throw new Error("Informe o preço anual cheio para o app calcular o desconto.");
      }
      if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0)) {
        throw new Error("O limite de usos precisa ser um número inteiro positivo.");
      }
      await savePromoCode({
        id: editingCode?.id,
        organizationId: orgId,
        code: form.code,
        description: form.description.trim() || null,
        discountPercent,
        appliesToPlan: form.appliesToPlan,
        annualPriceCents,
        active: form.active === "true",
        validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null,
        maxRedemptions,
        createdBy: currentUserId,
      });
    },
    onSuccess: async () => {
      setFormOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["promo-codes", orgId] });
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : String(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setPromoCodeActive(id, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["promo-codes", orgId] });
    },
  });

  function resetForm() {
    setEditingCode(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(code: PromoCode) {
    setEditingCode(code);
    setForm({
      code: code.code,
      description: code.description ?? "",
      discountPercent: String(code.discount_percent).replace(".", ","),
      appliesToPlan: code.applies_to_plan,
      annualPrice: code.annual_price_cents ? formatCentsInput(code.annual_price_cents) : "",
      active: code.active ? "true" : "false",
      validUntil: code.valid_until ? code.valid_until.slice(0, 10) : "",
      maxRedemptions: code.max_redemptions ? String(code.max_redemptions) : "",
    });
    setFormError("");
    setFormOpen(true);
  }

  if (!orgId) {
    return <WorkspaceGate error={orgError} onRetry={() => refetchOrganizations()} fullScreen />;
  }

  const promoCodes = promoCodesQuery.data ?? [];

  return (
    <AppShell
      activeSection="comercial"
      title="Códigos promocionais"
      subtitle="Descontos para adesão anual"
    >
      {!isAdmin ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Somente administradores do workspace podem cadastrar códigos promocionais.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo código
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Códigos cadastrados</CardTitle>
            </CardHeader>
            <CardContent>
              {promoCodes.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum código cadastrado ainda.
                </p>
              ) : (
                <div className="grid gap-3">
                  {promoCodes.map((code) => {
                    const finalAmount =
                      code.annual_price_cents === null
                        ? null
                        : Math.max(
                            code.annual_price_cents -
                              Math.round(
                                code.annual_price_cents * (Number(code.discount_percent) / 100),
                              ),
                            0,
                          );
                    return (
                      <div
                        key={code.id}
                        className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 text-sm lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary">
                              {code.code}
                            </span>
                            <span className="font-semibold">{code.discount_percent}% off</span>
                            <span className="text-xs text-muted-foreground">
                              {code.active ? "Ativo" : "Inativo"} · {code.redemption_count}
                              {code.max_redemptions ? `/${code.max_redemptions}` : ""} uso(s)
                            </span>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {code.description || "Sem descrição"} · Plano{" "}
                            {code.applies_to_plan === "family" ? "Família" : "Individual"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Preço cheio:{" "}
                            {code.annual_price_cents
                              ? formatCents(code.annual_price_cents)
                              : "não definido"}{" "}
                            · Valor com desconto:{" "}
                            {finalAmount === null ? "não calculado" : formatCents(finalAmount)}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(code)}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={toggleMutation.isPending}
                            onClick={() =>
                              toggleMutation.mutate({ id: code.id, active: !code.active })
                            }
                          >
                            {code.active ? (
                              <PowerOff className="mr-2 h-3.5 w-3.5" />
                            ) : (
                              <Power className="mr-2 h-3.5 w-3.5" />
                            )}
                            {code.active ? "Desativar" : "Ativar"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCode ? "Editar código" : "Novo código promocional"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Código</Label>
              <Input
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                }
                placeholder="MARINA_VASCULAR"
              />
            </div>
            <div>
              <Label>Desconto (%)</Label>
              <Input
                value={form.discountPercent}
                onChange={(event) =>
                  setForm((current) => ({ ...current, discountPercent: event.target.value }))
                }
                inputMode="decimal"
              />
            </div>
            <div>
              <Label>Plano aplicado</Label>
              <Select
                value={form.appliesToPlan}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    appliesToPlan: value as FormState["appliesToPlan"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="family">Família</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preço anual cheio</Label>
              <Input
                value={form.annualPrice}
                onChange={(event) =>
                  setForm((current) => ({ ...current, annualPrice: event.target.value }))
                }
                placeholder="497,00"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label>Validade</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(event) =>
                  setForm((current) => ({ ...current, validUntil: event.target.value }))
                }
              />
            </div>
            <div>
              <Label>Limite de usos</Label>
              <Input
                value={form.maxRedemptions}
                onChange={(event) =>
                  setForm((current) => ({ ...current, maxRedemptions: event.target.value }))
                }
                inputMode="numeric"
                placeholder="Sem limite"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.active}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, active: value as FormState["active"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Indicação Dra. Marina para pacientes vasculares"
              />
            </div>
            {formError ? <p className="md:col-span-2 text-sm text-red-600">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
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

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatCentsInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
