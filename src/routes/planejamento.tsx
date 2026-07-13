import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categoryOptions } from "@/lib/finance/categories";
import { fetchCategories } from "@/lib/finance/data";
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

type BudgetScope = "macro_income" | "macro_expense" | "category";

type BudgetRow = {
  id: string;
  scope_type: BudgetScope;
  scope_category_key: string;
  category_id: string | null;
  period_month: string;
  budget_year: number;
  budget_month: number;
  planned_amount: number;
  default_amount: number;
  is_manual_adjustment: boolean;
};

type MatrixRow = {
  key: string;
  scopeType: BudgetScope;
  categoryId: string | null;
  label: string;
  rowsByMonth: Map<number, BudgetRow>;
};

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function PlanningRoute() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [scopeType, setScopeType] = useState<BudgetScope>("macro_expense");
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
    queryKey: ["budgets", orgId, year],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select(
          "id, scope_type, scope_category_key, category_id, period_month, budget_year, budget_month, planned_amount, default_amount, is_manual_adjustment",
        )
        .eq("organization_id", orgId!)
        .eq("budget_year", year)
        .order("scope_type")
        .order("budget_month");
      if (error) throw new Error(error.message);
      return (data ?? []) as BudgetRow[];
    },
  });

  const categories = categoriesQuery.data ?? [];
  const categoryItems = categoryOptions(categories);
  const matrixRows = useMemo(
    () => buildMatrixRows(budgetsQuery.data ?? [], categoryItems),
    [budgetsQuery.data, categoryItems],
  );

  const generateAnnualBudget = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      if (scopeType === "category" && !categoryId) {
        throw new Error("Escolha a categoria ou subcategoria.");
      }
      const amount = Number(plannedAmount);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor válido.");
      const selectedCategoryId = scopeType === "category" ? categoryId : null;
      const scopeCategoryKey = selectedCategoryId ?? ZERO_UUID;
      const rows = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return {
          organization_id: orgId,
          scope_type: scopeType,
          scope_category_key: scopeCategoryKey,
          category_id: selectedCategoryId,
          budget_year: year,
          budget_month: month,
          period_month: `${year}-${String(month).padStart(2, "0")}-01`,
          planned_amount: amount,
          default_amount: amount,
          is_manual_adjustment: false,
        };
      });
      const { error } = await supabase.from("budgets").upsert(rows, {
        onConflict: "organization_id,scope_type,scope_category_key,budget_year,budget_month",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setPlannedAmount("");
      await queryClient.invalidateQueries({ queryKey: ["budgets", orgId, year] });
    },
  });

  const updateBudgetCell = useMutation({
    mutationFn: async ({ row, value }: { row: BudgetRow; value: number }) => {
      if (!orgId) return;
      const { error } = await supabase
        .from("budgets")
        .update({
          planned_amount: value,
          is_manual_adjustment: value !== Number(row.default_amount),
        })
        .eq("id", row.id)
        .eq("organization_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets", orgId, year] });
    },
  });

  return (
    <AppShell
      activeSection="planejamento"
      title="Planejamento"
      subtitle="Matriz anual por escopo, categoria ou subcategoria"
    >
      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Gerar planejamento anual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Ano</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </div>
            <div>
              <Label>Escopo</Label>
              <Select
                value={scopeType}
                onValueChange={(value) => setScopeType(value as BudgetScope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="macro_expense">Despesa total do mês</SelectItem>
                  <SelectItem value="macro_income">Receita total do mês</SelectItem>
                  <SelectItem value="category">Categoria ou subcategoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scopeType === "category" ? (
              <div>
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label>Valor mensal padrão</Label>
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
              disabled={!plannedAmount || generateAnnualBudget.isPending}
              onClick={() => generateAnnualBudget.mutate()}
            >
              Gerar 12 meses
            </Button>
            {generateAnnualBudget.error ? (
              <p className="text-sm text-red-700">
                {generateAnnualBudget.error instanceof Error
                  ? generateAnnualBudget.error.message
                  : String(generateAnnualBudget.error)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matriz de {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Escopo</TableHead>
                  {MONTHS.map((month) => (
                    <TableHead key={month} className="min-w-[96px] text-right">
                      {month}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrixRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    {MONTHS.map((_, index) => {
                      const month = index + 1;
                      const budget = row.rowsByMonth.get(month);
                      const adjusted =
                        budget?.is_manual_adjustment ||
                        Number(budget?.planned_amount ?? 0) !== Number(budget?.default_amount ?? 0);
                      return (
                        <TableCell
                          key={month}
                          className={adjusted ? "bg-amber-50 text-right" : "text-right"}
                        >
                          {budget ? (
                            <div>
                              <Input
                                key={`${budget.id}-${budget.planned_amount}`}
                                className="h-8 text-right"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={Number(budget.planned_amount).toFixed(2)}
                                onBlur={(event) => {
                                  const value = Number(event.target.value);
                                  if (
                                    Number.isFinite(value) &&
                                    value !== Number(budget.planned_amount)
                                  ) {
                                    updateBudgetCell.mutate({ row: budget, value });
                                  }
                                }}
                              />
                              {adjusted ? (
                                <span className="mt-1 block text-[10px] text-amber-700">
                                  ajustado
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {matrixRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                      Nenhum planejamento gerado para este ano.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            <p className="mt-3 text-sm text-muted-foreground">
              Células em destaque indicam meses ajustados manualmente em relação ao valor padrão do
              escopo.
            </p>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

function buildMatrixRows(
  budgets: BudgetRow[],
  categories: { id: string; path: string }[],
): MatrixRow[] {
  const categoryPaths = new Map(categories.map((category) => [category.id, category.path]));
  const rows = new Map<string, MatrixRow>();

  for (const budget of budgets) {
    const key = `${budget.scope_type}:${budget.scope_category_key}`;
    const row =
      rows.get(key) ??
      ({
        key,
        scopeType: budget.scope_type,
        categoryId: budget.category_id,
        label: scopeLabel(budget.scope_type, budget.category_id, categoryPaths),
        rowsByMonth: new Map<number, BudgetRow>(),
      } satisfies MatrixRow);
    row.rowsByMonth.set(budget.budget_month, budget);
    rows.set(key, row);
  }

  return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function scopeLabel(
  scopeType: BudgetScope,
  categoryId: string | null,
  categoryPaths: Map<string, string>,
) {
  if (scopeType === "macro_income") return "Receita total";
  if (scopeType === "macro_expense") return "Despesa total";
  return categoryId ? (categoryPaths.get(categoryId) ?? "Categoria") : "Categoria";
}
