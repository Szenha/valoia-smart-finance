import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/finance/AppShell";
import { AnalyticsTabs } from "@/components/finance/AnalyticsTabs";
import { fetchAccountBalances, fetchCardSummary, fetchHouseholdMembers } from "@/lib/finance/data";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/finance/types";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  component: DashboardRoute,
});

const COLORS = ["#059669", "#2563eb", "#dc2626", "#7c3aed", "#d97706", "#0891b2", "#C6D627"];
const BRAND_DARK_GREEN = "#035C3A";

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function DashboardRoute() {
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
  const bounds = monthBounds();
  const balancesQuery = useQuery({
    queryKey: ["account-balances", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccountBalances(orgId!),
  });
  const cardSummaryQuery = useQuery({
    queryKey: ["card-summary", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCardSummary(orgId!),
  });
  const receivableQuery = useQuery({
    queryKey: ["dashboard-receivable", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount")
        .eq("organization_id", orgId!)
        .gt("amount", 0)
        .gt("posted_at", new Date().toISOString());
      if (error) throw new Error(error.message);
      return (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
    },
  });
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_month_summary", { p_org_id: orgId! });
      if (error) throw new Error(error.message);
      return data?.[0] as {
        income: number;
        expenses: number;
        balance: number;
        previous_expenses: number;
        pending_review: number;
      };
    },
  });
  const categoryQuery = useQuery({
    queryKey: ["dashboard-category", orgId, bounds.start, bounds.end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("expenses_by_category", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { category_name: string; total: number }[];
    },
  });
  const pendingQuery = useQuery({
    queryKey: ["dashboard-pending", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, posted_at, description, amount")
        .eq("organization_id", orgId!)
        .eq("needs_review", true)
        .order("posted_at", { ascending: false })
        .limit(8);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const spendingByCreatorQuery = useQuery({
    queryKey: ["dashboard-spending-by-creator", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monthly_spending_by_creator", {
        p_org_id: orgId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { created_by: string | null; total: number; tx_count: number }[];
    },
  });

  const summary = summaryQuery.data;
  const delta = summary ? summary.expenses - summary.previous_expenses : 0;
  const creatorTotal = (spendingByCreatorQuery.data ?? []).reduce(
    (sum, row) => sum + Number(row.total),
    0,
  );
  const checkingBalances = balancesQuery.data ?? [];
  const consolidatedBalance = checkingBalances.reduce((sum, row) => sum + row.current_balance, 0);
  const totalCommitted = (cardSummaryQuery.data ?? []).reduce(
    (sum, row) => sum + row.limit_used,
    0,
  );
  const categoryTotal = (categoryQuery.data ?? []).reduce((sum, row) => sum + Number(row.total), 0);

  return (
    <AppShell activeSection="analytics" title="Dashboard" subtitle="Resumo do mês atual">
      <AnalyticsTabs value="dashboard" />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Receitas" value={formatCurrency(summary?.income ?? 0)} theme="green" />
        <StatCard label="Despesas" value={formatCurrency(summary?.expenses ?? 0)} theme="coral" />
        <StatCard
          label="A receber"
          value={formatCurrency(receivableQuery.data ?? 0)}
          theme="blue"
        />
        <StatCard
          label="Comprometido no cartão"
          value={formatCurrency(totalCommitted)}
          theme="brand-dark"
        />
      </section>

      {checkingBalances.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Saldo bancário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {checkingBalances.length > 1 ? (
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-sm font-medium">Total consolidado</span>
                <strong
                  className={`text-xl ${consolidatedBalance < 0 ? "text-red-700" : "text-emerald-700"}`}
                >
                  {formatCurrency(consolidatedBalance)}
                </strong>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {checkingBalances.map((row) => (
                <div
                  key={row.account_id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"
                >
                  <span>{row.name}</span>
                  <strong className={row.current_balance < 0 ? "text-red-700" : "text-emerald-700"}>
                    {formatCurrency(row.current_balance)}
                  </strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryQuery.data ?? []}
                    dataKey="total"
                    nameKey="category_name"
                    innerRadius={62}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {(categoryQuery.data ?? []).map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <strong className="text-lg">{formatCurrency(categoryTotal)}</strong>
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              {(categoryQuery.data ?? []).map((row, index) => {
                const percent = categoryTotal > 0 ? (Number(row.total) / categoryTotal) * 100 : 0;
                return (
                  <div key={row.category_name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate">{row.category_name}</span>
                    <span className="shrink-0 text-muted-foreground">{percent.toFixed(0)}%</span>
                    <strong className="w-24 shrink-0 text-right">
                      {formatCurrency(row.total)}
                    </strong>
                  </div>
                );
              })}
              {(categoryQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem despesas categorizadas no mês.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comparação com mês anterior</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={delta > 0 ? "text-red-700" : "text-emerald-700"}>
              {delta > 0 ? "Aumento" : "Redução"} de {formatCurrency(Math.abs(delta))} em despesas.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
              <span className="text-muted-foreground">Saldo do mês</span>
              <strong>{formatCurrency(summary?.balance ?? 0)}</strong>
            </div>
            <div className="mt-6 space-y-3">
              <h3 className="font-medium">
                Pendentes de revisão
                {summary?.pending_review ? ` (${summary.pending_review})` : ""}
              </h3>
              {(pendingQuery.data ?? []).map((transaction) => (
                <div key={transaction.id} className="flex justify-between border-b py-2 text-sm">
                  <span>{transaction.description}</span>
                  <strong>{formatCurrency(Number(transaction.amount))}</strong>
                </div>
              ))}
              {(pendingQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada pendente de revisão.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gastos por pessoa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(spendingByCreatorQuery.data ?? []).map((row) => {
              const member = (membersQuery.data ?? []).find((m) => m.user_id === row.created_by);
              const label =
                row.created_by === currentUserQuery.data?.id
                  ? "Eu"
                  : member
                    ? `Outro membro ${member.user_id.slice(0, 6)}`
                    : "Sem autor";
              const percent = creatorTotal > 0 ? (Number(row.total) / creatorTotal) * 100 : 0;
              return (
                <div key={row.created_by ?? "none"} className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>{label}</span>
                    <strong>{formatCurrency(Number(row.total))}</strong>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-600"
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(spendingByCreatorQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem gastos no mês.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Desktop-only: cards das faturas dos cartões, lado a lado com o resto —
            no mobile a análise por cartão fica em Cadastros > Contas e cartões. */}
        {(cardSummaryQuery.data ?? []).length > 0 ? (
          <Card className="hidden lg:block">
            <CardHeader>
              <CardTitle>Faturas dos cartões</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(cardSummaryQuery.data ?? []).map((card) => {
                const pct =
                  card.credit_limit && card.credit_limit > 0
                    ? Math.min((card.limit_used / card.credit_limit) * 100, 100)
                    : null;
                return (
                  <div
                    key={card.account_id}
                    className="rounded-lg border border-slate-200 p-3 text-sm"
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">{card.name}</span>
                      <strong>{formatCurrency(card.current_invoice_total)}</strong>
                    </div>
                    {pct !== null ? (
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                        <div
                          className={`h-1.5 rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-600"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fatura do mês vigente · {formatCurrency(card.future_installments_total)} em
                      parcelas futuras
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}
      </section>
    </AppShell>
  );
}

type StatTheme = "green" | "coral" | "blue" | "brand-dark";

const STAT_THEME: Record<StatTheme, { className: string; style?: CSSProperties }> = {
  green: { className: "bg-emerald-600" },
  coral: { className: "bg-rose-500" },
  blue: { className: "bg-sky-600" },
  "brand-dark": { className: "", style: { backgroundColor: BRAND_DARK_GREEN } },
};

function StatCard({ label, value, theme }: { label: string; value: string; theme: StatTheme }) {
  const { className, style } = STAT_THEME[theme];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-sm ${className}`}
      style={style}
    >
      <div className="pointer-events-none absolute -bottom-8 -right-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
      <div className="pointer-events-none absolute -left-8 -top-8 h-16 w-16 rounded-full bg-white/5 blur-lg" />
      <p className="relative truncate text-[10px] font-semibold uppercase tracking-wide text-white/80">
        {label}
      </p>
      <p className="relative mt-1 truncate text-lg font-bold leading-tight lg:text-2xl">{value}</p>
    </div>
  );
}
