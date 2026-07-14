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
import { buildCategoryTree, leafCategoryOptions } from "@/lib/finance/categories";
import { fetchCategories } from "@/lib/finance/data";
import { formatCurrency, type CategoryRow } from "@/lib/finance/types";
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
type Granularity = "macro" | "category" | "subcategory";

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

type PlanningRow = {
  key: string;
  scopeType: BudgetScope;
  categoryId: string | null;
  label: string;
  depth: number;
};

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function PlanningRoute() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [granularity, setGranularity] = useState<Granularity>("category");
  const [baseMonth, setBaseMonth] = useState(new Date().getMonth() + 1);
  const [editingCell, setEditingCell] = useState<{ key: string; value: string } | null>(null);

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

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const rows = useMemo(() => buildPlanningRows(granularity, categories), [granularity, categories]);
  const budgetByKey = useMemo(() => {
    const map = new Map<string, BudgetRow>();
    for (const budget of budgetsQuery.data ?? []) {
      map.set(`${budget.scope_type}:${budget.scope_category_key}:${budget.budget_month}`, budget);
    }
    return map;
  }, [budgetsQuery.data]);

  function amountFor(row: PlanningRow, month: number) {
    return Number(budgetByKey.get(`${row.key}:${month}`)?.planned_amount ?? 0);
  }

  const saveCell = useMutation({
    mutationFn: async ({
      row,
      month,
      amount,
    }: {
      row: PlanningRow;
      month: number;
      amount: number;
    }) => {
      if (!orgId) return;
      if (amount <= 0) {
        const { error } = await supabase
          .from("budgets")
          .delete()
          .eq("organization_id", orgId)
          .eq("scope_type", row.scopeType)
          .eq("scope_category_key", scopeCategoryKey(row.categoryId))
          .eq("budget_year", year)
          .eq("budget_month", month);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("budgets").upsert(
        {
          organization_id: orgId,
          scope_type: row.scopeType,
          scope_category_key: scopeCategoryKey(row.categoryId),
          category_id: row.categoryId,
          budget_year: year,
          budget_month: month,
          period_month: `${year}-${String(month).padStart(2, "0")}-01`,
          planned_amount: amount,
          default_amount: amount,
          is_manual_adjustment: false,
        },
        { onConflict: "organization_id,scope_type,scope_category_key,budget_year,budget_month" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets", orgId, year] });
    },
  });

  const replicateBaseMonth = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const filledRows = rows
        .map((row) => ({ row, amount: amountFor(row, baseMonth) }))
        .filter(({ amount }) => amount > 0);
      if (filledRows.length === 0) return;
      const payload = filledRows.flatMap(({ row, amount }) =>
        MONTHS.map((_, index) => ({
          organization_id: orgId,
          scope_type: row.scopeType,
          scope_category_key: scopeCategoryKey(row.categoryId),
          category_id: row.categoryId,
          budget_year: year,
          budget_month: index + 1,
          period_month: `${year}-${String(index + 1).padStart(2, "0")}-01`,
          planned_amount: amount,
          default_amount: amount,
          is_manual_adjustment: false,
        })),
      );
      const { error } = await supabase.from("budgets").upsert(payload, {
        onConflict: "organization_id,scope_type,scope_category_key,budget_year,budget_month",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets", orgId, year] });
    },
  });

  function startEditCell(row: PlanningRow, month: number) {
    const amount = amountFor(row, month);
    setEditingCell({
      key: `${row.key}:${month}`,
      value: amount > 0 ? String(amount).replace(".", ",") : "",
    });
  }

  function commitEditCell(row: PlanningRow, month: number, rawValue: string) {
    setEditingCell(null);
    const amount = parseAmount(rawValue);
    if (amount === amountFor(row, month)) return;
    saveCell.mutate({ row, month, amount });
  }

  return (
    <AppShell
      activeSection="planejamento"
      title="Planejamento"
      subtitle="Matriz anual construída sobre a mesma árvore de categorias de Cadastros"
    >
      <Card>
        <CardHeader>
          <CardTitle>Configuração do planejamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[110px_200px_160px_1fr]">
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
              <Label>Granularidade</Label>
              <Select
                value={granularity}
                onValueChange={(value) => setGranularity(value as Granularity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="macro">Despesa/receita total</SelectItem>
                  <SelectItem value="category">Categoria</SelectItem>
                  <SelectItem value="subcategory">Subcategoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mês base p/ replicar</Label>
              <Select
                value={String(baseMonth)}
                onValueChange={(value) => setBaseMonth(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, index) => (
                    <SelectItem key={month} value={String(index + 1)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={replicateBaseMonth.isPending}
                onClick={() => replicateBaseMonth.mutate()}
              >
                Replicar mês base para os 12 meses
              </Button>
            </div>
          </div>
          {replicateBaseMonth.error || saveCell.error ? (
            <p className="mt-3 text-sm text-red-700">
              {(replicateBaseMonth.error ?? saveCell.error) instanceof Error
                ? (replicateBaseMonth.error ?? saveCell.error)!.message
                : String(replicateBaseMonth.error ?? saveCell.error)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matriz de {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[220px] bg-white">
                    {granularity === "macro"
                      ? "Escopo"
                      : granularity === "category"
                        ? "Categoria"
                        : "Subcategoria"}
                  </TableHead>
                  {MONTHS.map((month) => (
                    <TableHead key={month} className="min-w-[150px] text-right">
                      {month}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell
                      className="sticky left-0 z-10 bg-white font-medium"
                      style={{ paddingLeft: `${row.depth * 16 + 16}px` }}
                    >
                      {row.label}
                    </TableCell>
                    {MONTHS.map((_, index) => {
                      const month = index + 1;
                      const cellKey = `${row.key}:${month}`;
                      const isEditing = editingCell?.key === cellKey;
                      const amount = amountFor(row, month);
                      return (
                        <TableCell key={month} className="text-right">
                          <Input
                            id={`cell-${cellKey}`}
                            type="text"
                            inputMode="decimal"
                            className="h-9 min-w-[150px] text-right tabular-nums"
                            placeholder="R$ 0,00"
                            value={
                              isEditing
                                ? editingCell.value
                                : amount > 0
                                  ? formatCurrency(amount)
                                  : ""
                            }
                            onFocus={() => startEditCell(row, month)}
                            onChange={(event) =>
                              setEditingCell((current) =>
                                current ? { ...current, value: event.target.value } : current,
                              )
                            }
                            onBlur={(event) => commitEditCell(row, month, event.target.value)}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                      {granularity === "macro"
                        ? "Nenhum escopo macro disponível."
                        : "Cadastre categorias em Cadastros > Categorias antes de planejar."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function buildPlanningRows(granularity: Granularity, categories: CategoryRow[]): PlanningRow[] {
  if (granularity === "macro") {
    return [
      {
        key: `macro_expense:${ZERO_UUID}`,
        scopeType: "macro_expense",
        categoryId: null,
        label: "Despesa total",
        depth: 0,
      },
      {
        key: `macro_income:${ZERO_UUID}`,
        scopeType: "macro_income",
        categoryId: null,
        label: "Receita total",
        depth: 0,
      },
    ];
  }

  if (granularity === "category") {
    return buildCategoryTree(categories).map((category) => ({
      key: `category:${category.id}`,
      scopeType: "category" as const,
      categoryId: category.id,
      label: category.name,
      depth: 0,
    }));
  }

  return leafCategoryOptions(categories).map((category) => ({
    key: `category:${category.id}`,
    scopeType: "category" as const,
    categoryId: category.id,
    label: category.path,
    depth: category.depth,
  }));
}

function scopeCategoryKey(categoryId: string | null) {
  return categoryId ?? ZERO_UUID;
}

function parseAmount(value: string | undefined) {
  const raw = value ?? "";
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}
