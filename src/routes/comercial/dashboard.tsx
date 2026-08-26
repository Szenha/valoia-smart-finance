import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Clock,
  CreditCard,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/finance/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeAdminMetrics,
  fetchAdminCustomers,
  TICLIO_STAFF_EMAIL,
} from "@/lib/commercial/access";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/comercial/dashboard")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
    if (user.email !== TICLIO_STAFF_EMAIL) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Comercial · Dashboard" }] }),
  component: DashboardRoute,
});

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function DashboardRoute() {
  const customersQuery = useQuery({
    queryKey: ["admin-customers"],
    queryFn: fetchAdminCustomers,
  });

  const rows = customersQuery.data ?? [];
  const metrics = computeAdminMetrics(rows);

  const cards = [
    { label: "Trials ativos", value: metrics.trialsActive, icon: Clock, tone: "text-slate-700" },
    {
      label: "Trials vencendo em 7 dias",
      value: metrics.trialsEndingSoon,
      icon: AlertTriangle,
      tone: "text-amber-700",
    },
    {
      label: "Trials expirados",
      value: metrics.trialsExpired,
      icon: UserX,
      tone: "text-slate-500",
    },
    {
      label: "Clientes ativos",
      value: metrics.customersActive,
      icon: UserCheck,
      tone: "text-emerald-700",
    },
    {
      label: "Conversão trial → pago",
      value: `${metrics.conversionPercent.toFixed(1)}%`,
      icon: TrendingUp,
      tone: "text-emerald-700",
    },
    {
      label: "MRR",
      value: formatCents(metrics.mrrCents),
      icon: CreditCard,
      tone: "text-primary",
    },
    {
      label: "Inadimplentes",
      value: metrics.overdue,
      icon: AlertTriangle,
      tone: "text-red-700",
    },
    { label: "Cancelados", value: metrics.cancelled, icon: Ban, tone: "text-slate-500" },
  ];

  return (
    <AppShell
      activeSection="comercial"
      title="Comercial"
      subtitle="Visão geral de trials e clientes"
    >
      {customersQuery.isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
      ) : customersQuery.error ? (
        <p className="p-6 text-sm text-red-600">
          {customersQuery.error instanceof Error
            ? customersQuery.error.message
            : String(customersQuery.error)}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <card.icon className={`h-3.5 w-3.5 ${card.tone}`} />
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold ${card.tone}`}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
          <Card className="col-span-2 sm:col-span-3 lg:col-span-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {rows.length} organizações no total
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Lista completa e filtros em "Clientes".
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
