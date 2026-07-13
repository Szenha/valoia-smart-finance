import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchCategories } from "@/lib/finance/data";
import { formatCurrency } from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/planejamento")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  component: PlanningRoute,
});

type BudgetRow = {
  id: string;
  category_id: string;
  period_month: string;
  planned_amount: number;
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthToDate(month: string) {
  return `${month}-01`;
}

function PlanningRoute() {
  const queryClient = useQueryClient();
  const [periodMonth, setPeriodMonth] = useState(currentMonth());
  const [categoryId, setCategoryId] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });
  const budgetsQuery = useQuery({
    queryKey: ["budgets", orgId, periodMonth],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("id, category_id, period_month, planned_amount")
        .eq("organization_id", orgId!)
        .eq("period_month", monthToDate(periodMonth))
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as BudgetRow[];
    },
  });

  const saveBudget = useMutation({
    mutationFn: async () => {
      if (!orgId || !categoryId) return;
      const amount = Number(plannedAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor válido.");
      const { error } = await supabase.from("budgets").upsert(
        {
          organization_id: orgId,
          category_id: categoryId,
          period_month: monthToDate(periodMonth),
          planned_amount: amount,
        },
        { onConflict: "organization_id,category_id,period_month" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setPlannedAmount("");
      await queryClient.invalidateQueries({ queryKey: ["budgets", orgId, periodMonth] });
    },
  });

  const categories = categoriesQuery.data ?? [];
  const budgets = budgetsQuery.data ?? [];

  return (
    <AppShell
      activeSection="planejamento"
      title="Planejamento"
      subtitle="Orçado vs realizado por categoria"
    >
      <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Planejar mês</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Mês</Label>
              <Input
                type="month"
                value={periodMonth}
                onChange={(event) => setPeriodMonth(event.target.value)}
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor planejado</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={plannedAmount}
                onChange={(event) => setPlannedAmount(event.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!categoryId || !plannedAmount || saveBudget.isPending}
              onClick={() => saveBudget.mutate()}
            >
              Salvar planejamento
            </Button>
            {saveBudget.error ? (
              <p className="text-sm text-red-700">
                {saveBudget.error instanceof Error
                  ? saveBudget.error.message
                  : String(saveBudget.error)}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Orçamentos de {periodMonth}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {budgets.map((budget) => {
              const category = categories.find((c) => c.id === budget.category_id);
              return (
                <div
                  key={budget.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <p className="font-medium">{category?.name ?? "Categoria"}</p>
                  <p className="text-sm text-muted-foreground">{category?.type ?? "tipo"}</p>
                  <strong>{formatCurrency(Number(budget.planned_amount))}</strong>
                </div>
              );
            })}
            {budgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum orçamento cadastrado neste mês.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
