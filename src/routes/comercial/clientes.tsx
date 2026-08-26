import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BILLING_CYCLE_LABEL,
  PAYMENT_METHOD_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  effectiveAdminStatus,
  fetchAdminCustomers,
  TICLIO_STAFF_EMAIL,
  type AdminCustomerRow,
  type SubscriptionStatus,
} from "@/lib/commercial/access";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/comercial/clientes")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
    if (user.email !== TICLIO_STAFF_EMAIL) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Comercial · Clientes" }] }),
  component: CustomersRoute,
});

type FilterKey =
  | "all"
  | "trial"
  | "trial_ending"
  | "trial_expired"
  | "active"
  | "overdue"
  | "cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "trial", label: "Trial" },
  { key: "trial_ending", label: "Trial vencendo" },
  { key: "trial_expired", label: "Trial expirado" },
  { key: "active", label: "Ativos" },
  { key: "overdue", label: "Inadimplentes" },
  { key: "cancelled", label: "Cancelados" },
];

function matchesFilter(
  row: AdminCustomerRow,
  status: SubscriptionStatus,
  filter: FilterKey,
): boolean {
  if (filter === "all") return true;
  if (filter === "trial") return status === "trial_active";
  if (filter === "trial_ending") {
    if (status !== "trial_active") return false;
    const daysLeft = Math.ceil((new Date(row.trial_ends_at).getTime() - Date.now()) / 86_400_000);
    return daysLeft <= 7;
  }
  if (filter === "trial_expired") return status === "trial_expired";
  if (filter === "active") return status === "active_paid";
  if (filter === "overdue") return status === "payment_overdue";
  if (filter === "cancelled") return status === "cancelled";
  return true;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const STATUS_TONE: Record<SubscriptionStatus, string> = {
  trial_active: "text-slate-700",
  trial_expired: "text-slate-500",
  awaiting_pix_confirmation: "text-amber-700",
  active_paid: "text-emerald-700",
  payment_overdue: "text-red-700",
  blocked_readonly: "text-red-700",
  cancelled: "text-slate-500",
};

function CustomersRoute() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const customersQuery = useQuery({
    queryKey: ["admin-customers"],
    queryFn: fetchAdminCustomers,
  });

  const rows = customersQuery.data ?? [];
  const filteredRows = rows.filter((row) => matchesFilter(row, effectiveAdminStatus(row), filter));

  return (
    <AppShell
      activeSection="comercial"
      title="Clientes"
      subtitle="Todas as organizações e assinaturas"
    >
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === option.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {customersQuery.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : customersQuery.error ? (
            <p className="p-6 text-sm text-red-600">
              {customersQuery.error instanceof Error
                ? customersQuery.error.message
                : String(customersQuery.error)}
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma organização nesse filtro.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial (início/fim)</TableHead>
                  <TableHead>Dias restantes</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Pago até</TableHead>
                  <TableHead>Próxima cobrança</TableHead>
                  <TableHead>Cupom</TableHead>
                  <TableHead>Cancelamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const status = effectiveAdminStatus(row);
                  const daysLeft = Math.ceil(
                    (new Date(row.trial_ends_at).getTime() - Date.now()) / 86_400_000,
                  );
                  return (
                    <TableRow key={row.organization_id}>
                      <TableCell className="font-medium text-slate-950">
                        {row.organization_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.owner_email}</TableCell>
                      <TableCell className={cn("font-medium", STATUS_TONE[status])}>
                        {SUBSCRIPTION_STATUS_LABEL[status] ?? status}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(row.trial_started_at)} – {formatDate(row.trial_ends_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {status === "trial_active" ? Math.max(daysLeft, 0) : "—"}
                      </TableCell>
                      <TableCell>{row.plan_name}</TableCell>
                      <TableCell>
                        {row.billing_cycle ? BILLING_CYCLE_LABEL[row.billing_cycle] : "—"}
                      </TableCell>
                      <TableCell>
                        {row.payment_method ? PAYMENT_METHOD_LABEL[row.payment_method] : "—"}
                      </TableCell>
                      <TableCell>{formatCents(row.amount_cents)}</TableCell>
                      <TableCell>{formatDate(row.paid_until)}</TableCell>
                      <TableCell>{formatDate(row.next_due_date)}</TableCell>
                      <TableCell>{row.promo_code ?? "—"}</TableCell>
                      <TableCell>{formatDate(row.cancelled_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
