import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Repeat,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchHouseholdMembers } from "@/lib/finance/data";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance/types";

export const Route = createFileRoute("/reports")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
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
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
  });
  const membersQuery = useQuery({
    queryKey: ["household-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchHouseholdMembers(orgId!),
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

  return (
    <AppShell
      activeSection="analytics"
      title="Relatórios"
      subtitle={isMobile ? "Resumo do mês atual" : "Visão consolidada do ano"}
    >
      <AnalyticsTabs value="reports" />
      <div className="flex justify-end">
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
                  : `Outro membro ${member.user_id.slice(0, 6)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isMobile ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Resumo do mês</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Receitas</p>
                <strong className="text-emerald-700">
                  {formatCurrency(summaryQuery.data?.income ?? 0)}
                </strong>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Despesas</p>
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
          <BudgetComparison rows={budgetQuery.data ?? []} />
          <ReportTable
            title="Despesas por categoria (mês atual)"
            rows={categoryQuery.data ?? []}
            labelKey="category_name"
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
              title="Por categoria"
              description="Despesas do ano agrupadas por categoria"
              anchor="#report-category"
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
          </section>

          <Card id="report-monthly">
            <CardHeader>
              <CardTitle>Comparação mês a mês</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyQuery.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month_start" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="income" fill="#059669" name="Receitas" />
                  <Bar dataKey="expenses" fill="#dc2626" name="Despesas" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <section className="grid gap-4 lg:grid-cols-2">
            <div id="report-budget">
              <BudgetComparison rows={budgetQuery.data ?? []} />
            </div>
            <ReportTable
              id="report-category"
              title="Despesas por categoria"
              rows={categoryQuery.data ?? []}
              labelKey="category_name"
            />
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
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  anchor: string;
}) {
  return (
    <a
      href={anchor}
      className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
    >
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
    </a>
  );
}

function BudgetComparison({ rows }: { rows: ReportRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Planejado vs realizado</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row, index) => {
            const planned = Number(row.planned_amount ?? 0);
            const actual = Number(row.actual_amount ?? 0);
            const difference = Number(row.difference_amount ?? 0);
            const over = planned > 0 && actual > planned;
            return (
              <div
                key={index}
                className={
                  over
                    ? "rounded-lg border border-red-200 bg-red-50 p-3 text-sm"
                    : "rounded-lg border border-slate-200 bg-white p-3 text-sm"
                }
              >
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{row.category_name ?? "Categoria"}</span>
                  <strong className={over ? "text-red-700" : "text-emerald-700"}>
                    {formatCurrency(difference)}
                  </strong>
                </div>
                <p className="text-muted-foreground">
                  Planejado {formatCurrency(planned)} · Realizado {formatCurrency(actual)}
                  {row.difference_percent !== null && row.difference_percent !== undefined
                    ? ` · ${Number(row.difference_percent).toFixed(1)}%`
                    : ""}
                </p>
              </div>
            );
          })}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum planejamento ou realizado encontrado no período.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportTable({
  id,
  title,
  rows,
  labelKey,
}: {
  id?: string;
  title: string;
  rows: ReportRow[];
  labelKey: string;
}) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex justify-between border-b py-2 text-sm">
              <span className="max-w-[70%] truncate">{row[labelKey] ?? "Sem nome"}</span>
              <strong>{formatCurrency(Number(row.total ?? row.amount ?? 0))}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
