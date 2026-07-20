import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Coins,
  Repeat,
  Scale,
  Tags,
  Target,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/finance/AppShell";
import { AnalyticsTabs } from "@/components/finance/AnalyticsTabs";
import { CategoryBreadcrumb } from "@/components/finance/CategoryBreadcrumb";
import { CollapsibleFilters } from "@/components/finance/CollapsibleFilters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCategoryDrilldown } from "@/lib/finance/category-drilldown";
import { fetchCategories, fetchHouseholdMembers, fetchMemberProfiles } from "@/lib/finance/data";
import { resolveMemberName } from "@/lib/finance/member-visuals";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";
import { categoryTypeLabelPlural, formatCurrency } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Relatórios" }] }),
  component: ReportsRoute,
});

function currentYearBounds() {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function currentMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function ReportsRoute() {
  const isMobile = useIsMobile();
  const [creatorFilter, setCreatorFilter] = useState("all");
  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
  });
  const { orgId } = useActiveOrganization(currentUserQuery.data?.id ?? null);
  const membersQuery = useQuery({
    queryKey: ["household-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchHouseholdMembers(orgId!),
  });
  const memberIds = (membersQuery.data ?? []).map((member) => member.user_id);
  const profilesQuery = useQuery({
    queryKey: ["member-profiles", orgId, memberIds],
    enabled: !!orgId && memberIds.length > 0,
    queryFn: () => fetchMemberProfiles(memberIds),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });
  // Mobile defaults to the current month only — dense multi-month tables/
  // charts are reserved for desktop, where there's room to compare them.
  const bounds = isMobile ? currentMonthBounds() : currentYearBounds();
  const createdBy = creatorFilter === "all" ? null : creatorFilter;
  const summaryQuery = useQuery({
    queryKey: ["reports-month-summary", orgId],
    enabled: !!orgId && isMobile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_month_summary", { p_org_id: orgId! });
      if (error) throw new Error(error.message);
      return data?.[0] as { income: number; expenses: number; balance: number } | undefined;
    },
  });
  const categoryQuery = useQuery({
    queryKey: ["reports-category", orgId, creatorFilter],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("expenses_by_category_for_user", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
        p_created_by: createdBy,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const incomeCategoryQuery = useQuery({
    queryKey: ["reports-income-category", orgId, creatorFilter],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("incomes_by_category_for_user", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
        p_created_by: createdBy,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const accountQuery = useQuery({
    queryKey: ["reports-account", orgId, creatorFilter],
    enabled: !!orgId && !isMobile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("expenses_by_account_for_user", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
        p_created_by: createdBy,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const largestQuery = useQuery({
    queryKey: ["reports-largest", orgId, creatorFilter],
    enabled: !!orgId && !isMobile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("largest_expenses_for_user", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
        p_limit: 10,
        p_created_by: createdBy,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const monthlyQuery = useQuery({
    queryKey: ["reports-monthly", orgId, creatorFilter],
    enabled: !!orgId && !isMobile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monthly_comparison_for_user", {
        p_org_id: orgId!,
        p_months: 6,
        p_created_by: createdBy,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const recurringQuery = useQuery({
    queryKey: ["reports-recurring", orgId],
    enabled: !!orgId && !isMobile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recurring_expenses", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const budgetQuery = useQuery({
    queryKey: ["reports-budget-vs-actual", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("budget_vs_actual", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const filteredByMember = creatorFilter !== "all";
  const householdWideNote = filteredByMember
    ? "Sempre mostra o total da família, não é afetado pelo filtro de pessoa acima."
    : undefined;
  const categories = categoriesQuery.data ?? [];
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const incomeCategories = categories.filter((category) => category.type === "income");
  const categoryDrilldown = useCategoryDrilldown(expenseCategories, categoryQuery.data ?? []);
  const incomeCategoryDrilldown = useCategoryDrilldown(
    incomeCategories,
    incomeCategoryQuery.data ?? [],
  );

  return (
    <AppShell
      activeSection="analytics"
      title="Relatórios"
      subtitle={isMobile ? "Resumo do mês atual" : "Visão consolidada do ano"}
    >
      <AnalyticsTabs value="reports" />
      <div className="flex justify-end">
        <CollapsibleFilters storageKey="calcum:reports-filters-collapsed">
          <Select value={creatorFilter} onValueChange={setCreatorFilter}>
            <SelectTrigger className="w-[220px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(membersQuery.data ?? []).map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.user_id === currentUserQuery.data?.id
                    ? "Eu"
                    : resolveMemberName(
                        member,
                        (profilesQuery.data ?? []).find((p) => p.id === member.user_id),
                        member.user_id,
                      )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CollapsibleFilters>
      </div>

      {isMobile ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Resumo do mês</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">{categoryTypeLabelPlural.income}</p>
                <strong className="text-emerald-700">
                  {formatCurrency(summaryQuery.data?.income ?? 0)}
                </strong>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{categoryTypeLabelPlural.expense}</p>
                <strong className="text-red-700">
                  {formatCurrency(summaryQuery.data?.expenses ?? 0)}
                </strong>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <strong>{formatCurrency(summaryQuery.data?.balance ?? 0)}</strong>
              </div>
            </CardContent>
          </Card>
          <BudgetComparison rows={budgetQuery.data ?? []} note={householdWideNote} />
          <CategoryBreakdownCard
            title="Despesas por categoria (mês atual)"
            drilldown={categoryDrilldown}
            error={categoryQuery.error}
          />
          <CategoryBreakdownCard
            title="Receitas por categoria (mês atual)"
            drilldown={incomeCategoryDrilldown}
            error={incomeCategoryQuery.error}
          />
          <p className="text-center text-xs text-muted-foreground">
            Comparações entre meses, por conta e recorrências ficam disponíveis no desktop.
          </p>
        </>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ReportEntryCard
              icon={TrendingUp}
              title="Comparação mês a mês"
              description="Receitas e despesas dos últimos 6 meses"
              anchor="#report-monthly"
            />
            <ReportEntryCard
              icon={Target}
              title="Planejado vs realizado"
              description="Quanto do orçamento do ano já foi usado, por categoria"
              anchor="#report-budget"
            />
            <ReportEntryCard
              icon={Tags}
              title="Despesas por categoria"
              description="Despesas do ano agrupadas por categoria"
              anchor="#report-category"
            />
            <ReportEntryCard
              icon={Coins}
              title="Receitas por categoria"
              description="Receitas do ano agrupadas por categoria"
              anchor="#report-income-category"
            />
            <ReportEntryCard
              icon={WalletCards}
              title="Por conta/cartão"
              description="Despesas do ano agrupadas por conta ou cartão"
              anchor="#report-account"
            />
            <ReportEntryCard
              icon={ArrowUpRight}
              title="Maiores despesas"
              description="As 10 maiores despesas individuais do ano"
              anchor="#report-largest"
            />
            <ReportEntryCard
              icon={Repeat}
              title="Recorrentes"
              description="Padrões de despesa que se repetem mês a mês"
              anchor="#report-recurring"
            />
            <ReportEntryCard
              icon={Scale}
              title="Rateio de despesas"
              description="Descubra quanto cada membro deve pagar ou receber"
              to="/reports/rateio"
            />
          </section>

          <Card id="report-monthly">
            <CardHeader>
              <CardTitle>Comparação mês a mês</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyQuery.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month_start"
                    tickFormatter={(value) =>
                      new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
                        month: "short",
                      })
                    }
                  />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="income" fill="#059669" name={categoryTypeLabelPlural.income} />
                  <Bar dataKey="expenses" fill="#dc2626" name={categoryTypeLabelPlural.expense} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <section className="grid gap-4 lg:grid-cols-2">
            <div id="report-budget">
              <BudgetComparison rows={budgetQuery.data ?? []} note={householdWideNote} />
            </div>
            <div id="report-category">
              <CategoryBreakdownCard
                title="Despesas por categoria"
                drilldown={categoryDrilldown}
                error={categoryQuery.error}
              />
            </div>
            <div id="report-income-category">
              <CategoryBreakdownCard
                title="Receitas por categoria"
                drilldown={incomeCategoryDrilldown}
                error={incomeCategoryQuery.error}
              />
            </div>
            <ReportTable
              id="report-account"
              title="Despesas por conta/cartão"
              rows={accountQuery.data ?? []}
              labelKey="account_name"
            />
            <ReportTable
              id="report-largest"
              title="Maiores despesas"
              rows={largestQuery.data ?? []}
              labelKey="description"
            />
            <ReportTable
              id="report-recurring"
              title="Despesas recorrentes"
              rows={recurringQuery.data ?? []}
              labelKey="pattern"
              note={householdWideNote}
            />
          </section>
        </>
      )}
    </AppShell>
  );
}

type ReportRow = Record<string, string | number | null>;

function ReportEntryCard({
  icon: Icon,
  title,
  description,
  anchor,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Seção na mesma página (a maioria dos relatórios). */
  anchor?: string;
  /** Rota própria — usado pelo rateio, que tem estado demais pra caber como seção. */
  to?: string;
}) {
  const className =
    "group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40";
  const content = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="mt-auto flex items-center gap-1 text-sm font-medium text-emerald-700">
        Ver detalhes{" "}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <a href={anchor} className={className}>
      {content}
    </a>
  );
}

/** budget_vs_actual returns one row per category *per month* in range — on
 *  desktop that's up to 12 rows for the same category with no period label,
 *  which just reads as duplicated/contradictory entries. The card promises
 *  a yearly figure per category, so sum across months here instead of
 *  rendering the raw monthly rows. */
function aggregateBudgetRows(rows: ReportRow[]) {
  const byCategory = new Map<
    string,
    { name: string; type: string; planned: number; actual: number }
  >();
  for (const row of rows) {
    const key = `${row.scope_type}:${row.category_id ?? "none"}`;
    const entry = byCategory.get(key) ?? {
      name: String(row.category_name ?? "Categoria"),
      type: String(row.category_type ?? row.scope_type ?? "expense"),
      planned: 0,
      actual: 0,
    };
    entry.planned += Number(row.planned_amount ?? 0);
    entry.actual += Number(row.actual_amount ?? 0);
    byCategory.set(key, entry);
  }
  return Array.from(byCategory.values());
}

function BudgetComparison({ rows, note }: { rows: ReportRow[]; note?: string }) {
  const aggregated = aggregateBudgetRows(rows);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planejado vs realizado</CardTitle>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {aggregated.map((entry, index) => {
            const isIncome = entry.type === "income" || entry.type === "macro_income";
            const planned = entry.planned;
            const actual = entry.actual;
            const difference = isIncome ? actual - planned : planned - actual;
            // Expenses: spending more than planned is bad. Income: receiving
            // less than planned is bad — the two directions are inverted.
            const bad = isIncome ? actual < planned : planned > 0 && actual > planned;
            const percent = planned !== 0 ? (difference / planned) * 100 : null;
            return (
              <div
                key={index}
                className={
                  bad
                    ? "rounded-lg border border-red-200 bg-red-50 p-3 text-sm"
                    : "rounded-lg border border-slate-200 bg-white p-3 text-sm"
                }
              >
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{entry.name}</span>
                  <strong className={bad ? "text-red-700" : "text-emerald-700"}>
                    {formatCurrency(Math.abs(difference))}
                  </strong>
                </div>
                <p className="text-muted-foreground">
                  Planejado {formatCurrency(planned)} · Realizado {formatCurrency(actual)}
                  {percent !== null ? ` · ${percent.toFixed(1)}%` : ""}
                </p>
              </div>
            );
          })}
          {aggregated.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum planejamento ou realizado encontrado no período.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Substitui o ReportTable genérico pra "Despesas por categoria": mostra só
 *  o nome do último nível (nunca "Saída > Casa > Funcionárias") e permite
 *  trocar a granularidade clicando num grupo (drill-down) ou no breadcrumb
 *  (drill-up) — ver useCategoryDrilldown. */
function CategoryBreakdownCard({
  title,
  drilldown,
  error,
}: {
  title: string;
  drilldown: ReturnType<typeof useCategoryDrilldown>;
  error?: unknown;
}) {
  const total = drilldown.buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>{title}</CardTitle>
        <CategoryBreadcrumb
          path={drilldown.path}
          onRoot={drilldown.drillToRoot}
          onStep={drilldown.drillToStep}
        />
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            Não foi possível carregar: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : (
          <div className="space-y-2">
            {drilldown.buckets.map((bucket) => {
              const percent = total > 0 ? (bucket.total / total) * 100 : 0;
              return (
                <button
                  type="button"
                  key={bucket.categoryId ?? "none"}
                  onClick={() => drilldown.drillInto(bucket)}
                  disabled={!bucket.drillable}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 border-b py-2 text-left text-sm",
                    bucket.drillable && "hover:bg-slate-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: bucket.color ?? "#94a3b8" }}
                    />
                    <span className="max-w-[60%] truncate">{bucket.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {percent.toFixed(0)}%
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <strong>{formatCurrency(bucket.total)}</strong>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5",
                        bucket.drillable ? "text-slate-400" : "text-transparent",
                      )}
                    />
                  </span>
                </button>
              );
            })}
            {drilldown.buckets.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nenhuma despesa no período.</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportTable({
  id,
  title,
  rows,
  labelKey,
  note,
}: {
  id?: string;
  title: string;
  rows: ReportRow[];
  labelKey: string;
  note?: string;
}) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex justify-between border-b py-2 text-sm">
              <span className="max-w-[70%] truncate">{row[labelKey] || "Sem nome"}</span>
              <strong>{formatCurrency(Number(row.total ?? row.amount ?? 0))}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
