import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function ReportsRoute() {
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const bounds = currentYearBounds();
  const categoryQuery = useQuery({
    queryKey: ["reports-category", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("expenses_by_category", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const accountQuery = useQuery({
    queryKey: ["reports-account", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("expenses_by_account", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const largestQuery = useQuery({
    queryKey: ["reports-largest", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("largest_expenses", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
        p_limit: 10,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const monthlyQuery = useQuery({
    queryKey: ["reports-monthly", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monthly_comparison", {
        p_org_id: orgId!,
        p_months: 6,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const recurringQuery = useQuery({
    queryKey: ["reports-recurring", orgId],
    enabled: !!orgId,
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

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-5">
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada do ano</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">Voltar</Link>
        </Button>
      </header>
      <Card>
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
        <ReportTable
          title="Despesas por categoria"
          rows={categoryQuery.data ?? []}
          labelKey="category_name"
        />
        <ReportTable
          title="Despesas por conta/cartão"
          rows={accountQuery.data ?? []}
          labelKey="account_name"
        />
        <ReportTable
          title="Maiores despesas"
          rows={largestQuery.data ?? []}
          labelKey="description"
        />
        <ReportTable
          title="Despesas recorrentes"
          rows={recurringQuery.data ?? []}
          labelKey="pattern"
        />
      </section>
    </main>
  );
}

type ReportRow = Record<string, string | number | null>;

function ReportTable({
  title,
  rows,
  labelKey,
}: {
  title: string;
  rows: ReportRow[];
  labelKey: string;
}) {
  return (
    <Card>
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
