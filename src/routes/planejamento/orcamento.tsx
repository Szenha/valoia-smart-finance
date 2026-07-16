import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Monitor,
  Pencil,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { PlanejamentoTabs } from "@/components/finance/PlanejamentoTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { buildCategoryTree, type CategoryOption } from "@/lib/finance/categories";
import { fetchCategories } from "@/lib/finance/data";
import {
  categoryTypeLabel,
  categoryTypeLabelPlural,
  formatCurrency,
  type CategoryRow,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/planejamento/orcamento")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Planejamento" }] }),
  component: PlanningRoute,
});

type BudgetScope = "macro_income" | "macro_expense" | "category";
type Granularity = "macro" | "category" | "subcategory";
type Section = "income" | "expense";

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
  section: Section;
  isGroup?: boolean;
  childKeys?: string[];
  parentKey?: string;
};

function sectionOf(category: Pick<CategoryRow, "type">): Section {
  return category.type === "income" ? "income" : "expense";
}

const SECTION_LABEL: Record<Section, string> = categoryTypeLabelPlural as Record<Section, string>;

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function currentMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type BudgetVsActualRow = {
  scope_type: BudgetScope;
  category_id: string | null;
  category_name: string;
  planned_amount: number;
  actual_amount: number;
  difference_amount: number;
};

type ActualRow = {
  scope_type: BudgetScope;
  category_id: string | null;
  budget_month: number;
  actual_amount: number;
};

function PlanningRoute() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showFullMatrixOnMobile, setShowFullMatrixOnMobile] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [granularity, setGranularity] = useState<Granularity>("category");
  // January by default — the natural start of an annual plan, not "today",
  // since replicate only copies rows that already have a value in this
  // month (a base month with nothing filled in silently replicates nothing).
  const [baseMonth, setBaseMonth] = useState(1);
  const [replicateSummary, setReplicateSummary] = useState<{
    filled: number;
    skipped: number;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{ key: string; value: string } | null>(null);
  const [showActuals, setShowActuals] = useState(false);
  // Starts in read-only "view" mode — the matrix is a plan you consult far
  // more often than you edit. "Editar" swaps cells for inputs; leaving edit
  // mode doesn't need a separate persistence step since each cell already
  // auto-saves on blur (see commitEditCell).
  const [isEditingMatrix, setIsEditingMatrix] = useState(false);

  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });
  const monthBounds = currentMonthBounds();
  const currentMonthPlanQuery = useQuery({
    queryKey: ["budget-vs-actual-current-month", orgId, monthBounds.start],
    enabled: !!orgId && isMobile && !showFullMatrixOnMobile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("budget_vs_actual", {
        p_org_id: orgId!,
        p_start: monthBounds.start,
        p_end: monthBounds.end,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as BudgetVsActualRow[];
    },
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
  const actualsQuery = useQuery({
    queryKey: ["planning-actuals", orgId, year],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("actuals_by_scope_and_month", {
        p_org_id: orgId!,
        p_start: `${year}-01-01`,
        p_end: `${year}-12-31`,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ActualRow[];
    },
  });

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const rows = useMemo(() => buildPlanningRows(granularity, categories), [granularity, categories]);
  const rowByKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);
  const budgetByKey = useMemo(() => {
    const map = new Map<string, BudgetRow>();
    for (const budget of budgetsQuery.data ?? []) {
      map.set(`${budget.scope_type}:${budget.scope_category_key}:${budget.budget_month}`, budget);
    }
    return map;
  }, [budgetsQuery.data]);
  const actualByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const actual of actualsQuery.data ?? []) {
      map.set(
        `${actual.scope_type}:${actual.category_id ?? ZERO_UUID}:${actual.budget_month}`,
        Number(actual.actual_amount),
      );
    }
    return map;
  }, [actualsQuery.data]);

  function amountFor(row: PlanningRow, month: number): number {
    if (row.isGroup && row.childKeys) {
      return row.childKeys.reduce((sum, childKey) => {
        const childRow = rowByKey.get(childKey);
        return sum + (childRow ? amountFor(childRow, month) : 0);
      }, 0);
    }
    return Number(budgetByKey.get(`${row.key}:${month}`)?.planned_amount ?? 0);
  }

  // Rollup across descendants is already computed server-side (recursive
  // category_descendants closure), so unlike amountFor this is a flat
  // lookup — no client-side recursion needed even for group rows.
  function actualFor(row: PlanningRow, month: number): number {
    return actualByKey.get(`${row.key}:${month}`) ?? 0;
  }

  function sectionSubtotal(section: Section, month: number) {
    return rows
      .filter((row) => row.section === section && row.depth === 0)
      .reduce((sum, row) => sum + amountFor(row, month), 0);
  }

  function sectionActualSubtotal(section: Section, month: number) {
    return rows
      .filter((row) => row.section === section && row.depth === 0)
      .reduce((sum, row) => sum + actualFor(row, month), 0);
  }

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const hasSeededGroupExpansion = useRef(false);

  useEffect(() => {
    if (hasSeededGroupExpansion.current) return;
    const groupKeys = rows.filter((row) => row.isGroup).map((row) => row.key);
    if (groupKeys.length === 0) return;
    hasSeededGroupExpansion.current = true;
    setExpandedGroups(new Set(groupKeys));
  }, [rows]);

  function toggleGroup(key: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visibleRows = useMemo(() => {
    function isRowVisible(row: PlanningRow): boolean {
      let current = row;
      while (current.parentKey) {
        if (!expandedGroups.has(current.parentKey)) return false;
        const parent = rowByKey.get(current.parentKey);
        if (!parent) break;
        current = parent;
      }
      return true;
    }
    return rows.filter((row) => isRowVisible(row));
  }, [rows, rowByKey, expandedGroups]);

  // Land on the current month instead of January when opening a matrix for
  // the current year — otherwise the user has to scroll right by hand every
  // time to find "now". Runs once the header has real cells to measure.
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledToCurrentMonth = useRef(false);
  useEffect(() => {
    if (hasAutoScrolledToCurrentMonth.current) return;
    if (rows.length === 0) return;
    if (year !== new Date().getFullYear()) return;
    const container = matrixScrollRef.current?.querySelector<HTMLDivElement>(".overflow-auto");
    if (!container) return;
    const headCells = container.querySelectorAll("thead tr:first-child th");
    const stickyHead = headCells[0] as HTMLElement | undefined;
    const targetHead = headCells[new Date().getMonth() + 1] as HTMLElement | undefined;
    if (!stickyHead || !targetHead) return;
    hasAutoScrolledToCurrentMonth.current = true;
    const stickyRect = stickyHead.getBoundingClientRect();
    const targetRect = targetHead.getBoundingClientRect();
    container.scrollLeft += targetRect.left - stickyRect.right;
  }, [rows, year]);

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
      // Group/subtotal rows are a computed sum, never a real budgets row —
      // replicating them would silently create a bogus parent-level plan
      // that double-counts alongside its own children.
      const eligibleRows = rows.filter((row) => !row.isGroup);
      const filledRows = eligibleRows
        .map((row) => ({ row, amount: amountFor(row, baseMonth) }))
        .filter(({ amount }) => amount > 0);
      if (filledRows.length === 0) {
        throw new Error(
          `Nenhuma categoria tem valor lançado em ${MONTHS[baseMonth - 1]} para replicar. Escolha outro mês base.`,
        );
      }
      // "Para os meses seguintes": only the base month onward, never
      // retroactively overwriting months that already passed.
      const targetMonths = MONTHS.map((_, index) => index + 1).filter(
        (month) => month >= baseMonth,
      );
      const payload = filledRows.flatMap(({ row, amount }) =>
        targetMonths.map((month) => ({
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
        })),
      );
      const { error } = await supabase.from("budgets").upsert(payload, {
        onConflict: "organization_id,scope_type,scope_category_key,budget_year,budget_month",
      });
      if (error) throw new Error(error.message);
      return { filled: filledRows.length, skipped: eligibleRows.length - filledRows.length };
    },
    onSuccess: async (result) => {
      setReplicateSummary(result ?? null);
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

  const mobileReadOnly = isMobile && showFullMatrixOnMobile;
  const showSimplifiedMobileView = isMobile && !showFullMatrixOnMobile;
  const totalCols = 1 + MONTHS.length * (showActuals ? 2 : 1);

  return (
    <AppShell
      activeSection="planejamento"
      title="Planejamento"
      subtitle="Matriz anual construída sobre a mesma árvore de categorias de Cadastros"
    >
      <PlanejamentoTabs value="orcamento" />
      {showSimplifiedMobileView ? (
        <CurrentMonthPlanCard
          rows={currentMonthPlanQuery.data ?? []}
          loading={currentMonthPlanQuery.isLoading}
          onViewFullMatrix={() => setShowFullMatrixOnMobile(true)}
        />
      ) : (
        <>
          {mobileReadOnly ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    A edição do planejamento anual é otimizada para desktop. Você está vendo a
                    matriz completa apenas para consulta — os campos não são editáveis aqui.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 bg-white"
                  onClick={() => setShowFullMatrixOnMobile(false)}
                >
                  Voltar ao resumo do mês
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Configuração do planejamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={
                  mobileReadOnly
                    ? "grid gap-3 sm:grid-cols-2"
                    : "grid gap-3 sm:grid-cols-[110px_200px_160px_1fr]"
                }
              >
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
                      <SelectItem value="macro">
                        {categoryTypeLabel.expense}/{categoryTypeLabel.income.toLowerCase()} total
                      </SelectItem>
                      <SelectItem value="category">Categoria</SelectItem>
                      <SelectItem value="subcategory">Subcategoria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!mobileReadOnly ? (
                  <>
                    <div>
                      <Label>Mês base p/ replicar</Label>
                      <Select
                        value={String(baseMonth)}
                        onValueChange={(value) => {
                          setBaseMonth(Number(value));
                          setReplicateSummary(null);
                        }}
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
                        Replicar planejamento para os meses seguintes
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
              {replicateBaseMonth.error || saveCell.error ? (
                <p className="mt-3 text-sm text-red-700">
                  {(replicateBaseMonth.error ?? saveCell.error) instanceof Error
                    ? (replicateBaseMonth.error ?? saveCell.error)!.message
                    : String(replicateBaseMonth.error ?? saveCell.error)}
                </p>
              ) : replicateSummary ? (
                <p className="mt-3 text-sm text-emerald-700">
                  {replicateSummary.filled}{" "}
                  {replicateSummary.filled === 1 ? "categoria replicada" : "categorias replicadas"}{" "}
                  de {MONTHS[baseMonth - 1]} em diante.
                  {replicateSummary.skipped > 0
                    ? ` ${replicateSummary.skipped} ${replicateSummary.skipped === 1 ? "categoria foi ignorada" : "categorias foram ignoradas"} por não ter valor em ${MONTHS[baseMonth - 1]}.`
                    : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Matriz de {year}</CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="show-actuals"
                    className="text-sm font-normal text-muted-foreground"
                  >
                    Mostrar realizado
                  </Label>
                  <Switch
                    id="show-actuals"
                    checked={showActuals}
                    onCheckedChange={setShowActuals}
                  />
                </div>
                {!mobileReadOnly ? (
                  <Button
                    type="button"
                    variant={isEditingMatrix ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsEditingMatrix((current) => !current)}
                  >
                    {isEditingMatrix ? (
                      <>
                        <Check className="mr-1.5 h-4 w-4" />
                        Concluir edição
                      </>
                    ) : (
                      <>
                        <Pencil className="mr-1.5 h-4 w-4" />
                        Editar
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <div ref={matrixScrollRef} className="relative rounded-lg border border-slate-200">
                <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-white to-transparent" />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        rowSpan={showActuals ? 2 : 1}
                        className="sticky left-0 z-10 min-w-[220px] bg-white align-bottom"
                      >
                        {granularity === "macro"
                          ? "Escopo"
                          : granularity === "category"
                            ? "Categoria"
                            : "Subcategoria"}
                      </TableHead>
                      {MONTHS.map((month, index) => (
                        <TableHead
                          key={month}
                          colSpan={showActuals ? 2 : 1}
                          className={cn(
                            "min-w-[150px] text-center",
                            index > 0 && "border-l border-slate-200",
                          )}
                        >
                          {month}
                        </TableHead>
                      ))}
                    </TableRow>
                    {showActuals ? (
                      <TableRow>
                        {MONTHS.map((month, index) => (
                          <Fragment key={month}>
                            <TableHead
                              className={cn(
                                "min-w-[130px] text-right text-[11px] font-normal normal-case tracking-normal text-muted-foreground",
                                index > 0 && "border-l border-slate-200",
                              )}
                            >
                              Previsto
                            </TableHead>
                            <TableHead className="min-w-[110px] text-right text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                              Realizado
                            </TableHead>
                          </Fragment>
                        ))}
                      </TableRow>
                    ) : null}
                  </TableHeader>
                  <TableBody>
                    {(["income", "expense"] as Section[]).map((section) => {
                      const sectionRows = visibleRows.filter((row) => row.section === section);
                      if (sectionRows.length === 0) return null;
                      const topLevelCount = rows.filter(
                        (row) => row.section === section && row.depth === 0,
                      ).length;
                      return (
                        <Fragment key={section}>
                          <TableRow className="bg-slate-50 hover:bg-slate-50">
                            {/* position:sticky doesn't reliably stick on a
                                colSpan'd <td> across browsers — split the
                                label into its own single-column sticky cell
                                and let a plain (non-sticky) filler cover the
                                rest of the row's width. */}
                            <TableCell className="sticky left-0 z-10 bg-slate-50 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {SECTION_LABEL[section]}
                            </TableCell>
                            <TableCell colSpan={totalCols - 1} className="bg-slate-50 py-2" />
                          </TableRow>
                          {sectionRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell
                                className={cn(
                                  "sticky left-0 z-10 bg-white",
                                  row.isGroup
                                    ? "font-semibold"
                                    : row.depth > 0
                                      ? "font-normal text-slate-600"
                                      : "font-medium",
                                )}
                                style={{ paddingLeft: `${row.depth * 20 + 16}px` }}
                              >
                                <div className="flex items-center gap-1.5">
                                  {row.isGroup ? (
                                    <button
                                      type="button"
                                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                      onClick={() => toggleGroup(row.key)}
                                    >
                                      {expandedGroups.has(row.key) ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  ) : row.depth > 0 ? (
                                    <span className="h-3.5 w-3.5 shrink-0 rounded-bl-sm border-b border-l border-slate-300" />
                                  ) : null}
                                  <span className="truncate">{row.label}</span>
                                </div>
                              </TableCell>
                              {MONTHS.map((_, index) => {
                                const month = index + 1;
                                const cellKey = `${row.key}:${month}`;
                                const isEditing = editingCell?.key === cellKey;
                                const amount = amountFor(row, month);
                                const actual = actualFor(row, month);
                                if (mobileReadOnly || row.isGroup || !isEditingMatrix) {
                                  return (
                                    <Fragment key={month}>
                                      <TableCell
                                        className={cn(
                                          row.isGroup && "bg-slate-50/60",
                                          index > 0 && "border-l border-slate-200",
                                        )}
                                      >
                                        <PlannedAmountCell
                                          planned={amount}
                                          emphasis={row.isGroup}
                                        />
                                      </TableCell>
                                      {showActuals ? (
                                        <TableCell className={cn(row.isGroup && "bg-slate-50/60")}>
                                          <ActualAmountCell
                                            actual={actual}
                                            planned={amount}
                                            section={row.section}
                                          />
                                        </TableCell>
                                      ) : null}
                                    </Fragment>
                                  );
                                }
                                return (
                                  <Fragment key={month}>
                                    <TableCell
                                      className={cn(
                                        "text-right",
                                        index > 0 && "border-l border-slate-200",
                                      )}
                                    >
                                      <Input
                                        id={`cell-${cellKey}`}
                                        type="text"
                                        inputMode="decimal"
                                        className="h-9 min-w-[140px] text-right tabular-nums"
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
                                            current
                                              ? { ...current, value: event.target.value }
                                              : current,
                                          )
                                        }
                                        onBlur={(event) =>
                                          commitEditCell(row, month, event.target.value)
                                        }
                                      />
                                    </TableCell>
                                    {showActuals ? (
                                      <TableCell>
                                        <ActualAmountCell
                                          actual={actual}
                                          planned={amount}
                                          section={row.section}
                                        />
                                      </TableCell>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </TableRow>
                          ))}
                          {topLevelCount > 1 ? (
                            <TableRow className="bg-slate-100 hover:bg-slate-100">
                              <TableCell className="sticky left-0 z-10 bg-slate-100 font-semibold">
                                Subtotal {SECTION_LABEL[section]}
                              </TableCell>
                              {MONTHS.map((_, index) => {
                                const month = index + 1;
                                const planned = sectionSubtotal(section, month);
                                return (
                                  <Fragment key={index}>
                                    <TableCell
                                      className={cn(index > 0 && "border-l border-slate-200")}
                                    >
                                      <PlannedAmountCell planned={planned} emphasis />
                                    </TableCell>
                                    {showActuals ? (
                                      <TableCell>
                                        <ActualAmountCell
                                          actual={sectionActualSubtotal(section, month)}
                                          planned={planned}
                                          section={section}
                                        />
                                      </TableCell>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                    {rows.length > 0 ? (
                      <TableRow className="bg-emerald-50 hover:bg-emerald-50">
                        <TableCell className="sticky left-0 z-10 bg-emerald-50 font-semibold text-primary">
                          Resultado
                        </TableCell>
                        {MONTHS.map((_, index) => {
                          const month = index + 1;
                          const planned =
                            sectionSubtotal("income", month) - sectionSubtotal("expense", month);
                          const actual =
                            sectionActualSubtotal("income", month) -
                            sectionActualSubtotal("expense", month);
                          return (
                            <Fragment key={month}>
                              <TableCell
                                className={cn(
                                  "text-right font-semibold tabular-nums text-primary",
                                  planned < 0 && "text-rose-600",
                                  index > 0 && "border-l border-slate-200",
                                )}
                              >
                                {formatCurrency(planned)}
                              </TableCell>
                              {showActuals ? (
                                <TableCell
                                  className={cn(
                                    "text-right font-semibold tabular-nums",
                                    actual < 0
                                      ? "text-rose-600"
                                      : actual > 0
                                        ? "text-emerald-700"
                                        : "text-muted-foreground",
                                  )}
                                >
                                  {formatCurrency(actual)}
                                </TableCell>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </TableRow>
                    ) : null}
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={totalCols}
                          className="py-8 text-center text-muted-foreground"
                        >
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
        </>
      )}
    </AppShell>
  );
}

function CurrentMonthPlanCard({
  rows,
  loading,
  onViewFullMatrix,
}: {
  rows: BudgetVsActualRow[];
  loading: boolean;
  onViewFullMatrix: () => void;
}) {
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="capitalize">Planejamento de {monthLabel}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Categoria, planejado, realizado e diferença
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum valor planejado para este mês ainda.
          </p>
        ) : null}
        {rows.map((row) => {
          const overBudget = row.difference_amount < 0;
          return (
            <div
              key={`${row.scope_type}:${row.category_id ?? "macro"}`}
              className="rounded-lg border border-slate-200 p-3 text-sm"
            >
              <p className="font-medium">{row.category_name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Planejado {formatCurrency(row.planned_amount)}</span>
                <span>Realizado {formatCurrency(row.actual_amount)}</span>
                <span className={overBudget ? "font-semibold text-red-700" : "text-emerald-700"}>
                  {overBudget ? "Acima em " : "Dentro do previsto, sobram "}
                  {formatCurrency(Math.abs(row.difference_amount))}
                </span>
              </div>
            </div>
          );
        })}
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={onViewFullMatrix}>
          Ver planejamento anual completo (somente leitura)
        </Button>
      </CardContent>
    </Card>
  );
}

function PlannedAmountCell({ planned, emphasis }: { planned: number; emphasis?: boolean }) {
  return (
    <div className={cn("text-right tabular-nums", emphasis && "font-semibold")}>
      {planned > 0 ? formatCurrency(planned) : "—"}
    </div>
  );
}

/**
 * "Bom"/"ruim" depende da seção: gastar menos que o planejado é bom para
 * despesa, mas receber menos que o planejado é ruim para receita. Sem meta
 * definida (planned = 0) não há o que comparar — mostra neutro.
 */
function ActualAmountCell({
  actual,
  planned,
  section,
}: {
  actual: number;
  planned: number;
  section: Section;
}) {
  const hasTarget = planned > 0;
  const isGood = hasTarget ? (section === "expense" ? actual <= planned : actual >= planned) : null;
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 text-right tabular-nums",
        hasTarget && (isGood ? "text-emerald-700" : "text-rose-600"),
      )}
    >
      {hasTarget ? (
        isGood ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        )
      ) : null}
      <span>{actual > 0 ? formatCurrency(actual) : "—"}</span>
    </div>
  );
}

function buildPlanningRows(granularity: Granularity, categories: CategoryRow[]): PlanningRow[] {
  if (granularity === "macro") {
    return [
      {
        key: `macro_income:${ZERO_UUID}`,
        scopeType: "macro_income",
        categoryId: null,
        label: `${categoryTypeLabel.income} total`,
        depth: 0,
        section: "income",
      },
      {
        key: `macro_expense:${ZERO_UUID}`,
        scopeType: "macro_expense",
        categoryId: null,
        label: `${categoryTypeLabel.expense} total`,
        depth: 0,
        section: "expense",
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
      section: sectionOf(category),
    }));
  }

  // Subcategory view: a full tree. Categories with children become a
  // read-only group row (planned amount = sum of its children, computed by
  // amountFor) followed by their descendants; leaf categories stay a single
  // editable row exactly like before.
  function buildNode(
    category: CategoryOption,
    depth: number,
    section: Section,
    parentKey?: string,
  ): PlanningRow[] {
    const key = `category:${category.id}`;
    if (category.children.length === 0) {
      return [
        {
          key,
          scopeType: "category" as const,
          categoryId: category.id,
          label: category.name,
          depth,
          section,
          parentKey,
        },
      ];
    }
    const childRows = category.children.flatMap((child) =>
      buildNode(child, depth + 1, section, key),
    );
    const groupRow: PlanningRow = {
      key,
      scopeType: "category" as const,
      categoryId: category.id,
      label: category.name,
      depth,
      section,
      isGroup: true,
      childKeys: category.children.map((child) => `category:${child.id}`),
      parentKey,
    };
    return [groupRow, ...childRows];
  }

  return buildCategoryTree(categories).flatMap((category) =>
    buildNode(category, 0, sectionOf(category)),
  );
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
