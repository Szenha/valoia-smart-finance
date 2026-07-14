import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/finance/AppShell";
import { AnalyticsTabs } from "@/components/finance/AnalyticsTabs";
import { fetchHouseholdMembers } from "@/lib/finance/data";
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

const COLORS = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#d97706", "#0891b2"];

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

  return (
    <AppShell activeSection="analytics" title="Dashboard" subtitle="Resumo do mês atual">
      <AnalyticsTabs value="dashboard" />
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Receitas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-700">
            {formatCurrency(summary?.income ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Despesas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-red-700">
            {formatCurrency(summary?.expenses ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saldo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(summary?.balance ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revisões</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-700">
            {summary?.pending_review ?? 0}
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryQuery.data ?? []}
                  dataKey="total"
                  nameKey="category_name"
                  outerRadius={85}
                  label
                >
                  {(categoryQuery.data ?? []).map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
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
            <div className="mt-6 space-y-3">
              <h3 className="font-medium">Pendentes de revisão</h3>
              {(pendingQuery.data ?? []).map((transaction) => (
                <div key={transaction.id} className="flex justify-between border-b py-2 text-sm">
                  <span>{transaction.description}</span>
                  <strong>{formatCurrency(Number(transaction.amount))}</strong>
                </div>
              ))}
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
      </section>
    </AppShell>
  );
}
