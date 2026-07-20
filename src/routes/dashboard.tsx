import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, HandCoins } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppShell } from "@/components/finance/AppShell";
import { AnalyticsTabs } from "@/components/finance/AnalyticsTabs";
import { CategoryPieCard } from "@/components/finance/CategoryPieCard";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { SettleBillDialog } from "@/components/finance/SettleBillDialog";
import { StatTile } from "@/components/finance/StatTile";
import {
  ensureRecurringBillOccurrences,
  fetchAccountBalances,
  fetchAccounts,
  fetchCalendarEventsUpcoming,
  fetchCardSummary,
  fetchCategories,
  fetchFamilyMembers,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  fetchRecurringBillsUpcoming,
} from "@/lib/finance/data";
import { categoryIconFor } from "@/lib/finance/category-icons";
import { useCategoryDrilldown } from "@/lib/finance/category-drilldown";
import { addDaysToDateOnly, localToday } from "@/lib/finance/date-utils";
import { eventIconFor } from "@/lib/finance/event-icons";
import { billOccurrenceState } from "@/lib/finance/recurring-bills";
import { resolveMemberColor, resolveMemberName } from "@/lib/finance/member-visuals";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";
import {
  categoryTypeLabelPlural,
  formatCurrency,
  type CalendarEventOccurrence,
  type RecurringBillOccurrenceRow,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const UPCOMING_BILLS_WINDOW_DAYS = 30;

type UpcomingItem =
  | { kind: "bill"; date: string; occurrence: RecurringBillOccurrenceRow }
  | { kind: "event"; date: string; occurrence: CalendarEventOccurrence };

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Dashboard" }] }),
  component: DashboardRoute,
});

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function DashboardRoute() {
  const queryClient = useQueryClient();
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
      return (data ?? []) as { category_id: string | null; category_name: string; total: number }[];
    },
  });
  const incomeCategoryQuery = useQuery({
    queryKey: ["dashboard-income-category", orgId, bounds.start, bounds.end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("incomes_by_category", {
        p_org_id: orgId!,
        p_start: bounds.start,
        p_end: bounds.end,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { category_id: string | null; category_name: string; total: number }[];
    },
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccounts(orgId!),
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
  // Mesma RPC (ensure + fetch) reaproveitada pela aba Planejamento > Contas
  // fixas — fonte única para o calendário de vencimentos.
  const upcomingBillsQuery = useQuery({
    queryKey: ["dashboard-upcoming-bills", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const start = localToday();
      const end = addDaysToDateOnly(start, UPCOMING_BILLS_WINDOW_DAYS);
      await ensureRecurringBillOccurrences(orgId!, end);
      return fetchRecurringBillsUpcoming(orgId!, start, end);
    },
  });
  // Mesma janela de 30 dias das contas, mesclada na mesma lista "Próximos
  // eventos" — compromissos da família (Calendário) não têm "pago"/"pulado",
  // só aparecem e levam pra edição no Calendário quando clicados.
  const upcomingEventsQuery = useQuery({
    queryKey: ["dashboard-upcoming-events", orgId],
    enabled: !!orgId,
    queryFn: () => {
      const start = localToday();
      const end = addDaysToDateOnly(start, UPCOMING_BILLS_WINDOW_DAYS);
      return fetchCalendarEventsUpcoming(orgId!, start, end);
    },
  });
  const familyMembersQuery = useQuery({
    queryKey: ["family-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchFamilyMembers(orgId!),
  });
  const [settlingOccurrence, setSettlingOccurrence] = useState<RecurringBillOccurrenceRow | null>(
    null,
  );

  const upcomingItems: UpcomingItem[] = [
    ...(upcomingBillsQuery.data ?? []).map(
      (occurrence): UpcomingItem => ({ kind: "bill", date: occurrence.due_date, occurrence }),
    ),
    ...(upcomingEventsQuery.data ?? []).map(
      (occurrence): UpcomingItem => ({
        kind: "event",
        date: occurrence.occurrence_date,
        occurrence,
      }),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const summary = summaryQuery.data;
  const delta = summary ? summary.expenses - summary.previous_expenses : 0;
  // previous_expenses being exactly 0 is our only signal that there's
  // nothing to compare against yet (a brand-new org, or the household's
  // first month of use) — showing "aumento de R$X" against a zero baseline
  // reads as a real trend when it's actually just missing data.
  const hasPreviousMonthData = (summary?.previous_expenses ?? 0) > 0;
  const creatorTotal = (spendingByCreatorQuery.data ?? []).reduce(
    (sum, row) => sum + Number(row.total),
    0,
  );
  const allBalances = balancesQuery.data ?? [];
  const checkingBalances = allBalances.filter((row) => row.kind === "checking");
  const investmentBalances = allBalances.filter((row) => row.kind === "investment");
  const checkingTotal = checkingBalances.reduce((sum, row) => sum + row.current_balance, 0);
  const investmentTotal = investmentBalances.reduce((sum, row) => sum + row.current_balance, 0);
  const totalCommitted = (cardSummaryQuery.data ?? []).reduce(
    (sum, row) => sum + row.limit_used,
    0,
  );
  const netWorth = checkingTotal + investmentTotal - totalCommitted;
  const categories = categoriesQuery.data ?? [];
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const incomeCategories = categories.filter((category) => category.type === "income");
  const categoryDrilldown = useCategoryDrilldown(expenseCategories, categoryQuery.data ?? []);
  const incomeCategoryDrilldown = useCategoryDrilldown(
    incomeCategories,
    incomeCategoryQuery.data ?? [],
  );

  return (
    <AppShell activeSection="analytics" title="Dashboard" subtitle="Resumo do mês atual">
      <AnalyticsTabs value="dashboard" />

      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Visão geral do mês
      </h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label={categoryTypeLabelPlural.income}
          value={formatCurrency(summary?.income ?? 0)}
          theme="green"
        />
        <StatTile
          label={categoryTypeLabelPlural.expense}
          value={formatCurrency(summary?.expenses ?? 0)}
          theme="coral"
        />
        <StatTile
          label="A receber"
          value={formatCurrency(receivableQuery.data ?? 0)}
          theme="blue"
        />
        <StatTile
          label="Comprometido no cartão"
          value={formatCurrency(totalCommitted)}
          theme="amber"
        />
      </section>

      {allBalances.length > 0 || totalCommitted > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Patrimônio total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <p
                className={`text-2xl font-bold sm:text-3xl ${netWorth < 0 ? "text-red-700" : "text-emerald-700"}`}
              >
                {formatCurrency(netWorth)}
              </p>
              <span className="text-xs text-muted-foreground">patrimônio líquido</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <PatrimonyStat
                label="Contas correntes"
                total={checkingTotal}
                items={checkingBalances.map((row) => ({
                  key: row.account_id,
                  name: row.name,
                  value: formatCurrency(row.current_balance),
                }))}
              />
              <PatrimonyStat
                label="Investimentos"
                total={investmentTotal}
                items={investmentBalances.map((row) => ({
                  key: row.account_id,
                  name: row.name,
                  value: formatCurrency(row.current_balance),
                }))}
              />
              <PatrimonyStat
                label="Cartões (dívida)"
                total={-totalCommitted}
                items={(cardSummaryQuery.data ?? []).map((card) => ({
                  key: card.account_id,
                  name: card.name,
                  value: formatCurrency(-card.current_invoice_total),
                }))}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Detalhamento
      </h2>
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <CategoryPieCard
          title="Despesas por categoria"
          drilldown={categoryDrilldown}
          emptyLabel="Sem despesas categorizadas no mês."
          error={categoryQuery.error}
        />
        <CategoryPieCard
          title="Receitas por categoria"
          drilldown={incomeCategoryDrilldown}
          emptyLabel="Sem receitas categorizadas no mês."
          error={incomeCategoryQuery.error}
        />
        <Card>
          <CardHeader>
            <CardTitle>Comparação com mês anterior</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label={delta > 0 ? "Aumento em despesas" : "Redução em despesas"}
                value={hasPreviousMonthData ? formatCurrency(Math.abs(delta)) : "—"}
                theme={delta > 0 ? "coral" : "green"}
                compact
              />
              <StatTile
                label="Saldo do mês"
                value={formatCurrency(summary?.balance ?? 0)}
                theme="blue"
                compact
              />
            </div>
            {!hasPreviousMonthData ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Ainda não há dados do mês anterior para comparar.
              </p>
            ) : null}
            <div className="mt-6 space-y-1">
              <h3 className="font-medium">
                Pendentes de revisão
                {summary?.pending_review ? ` (${summary.pending_review})` : ""}
              </h3>
              <p className="text-xs text-muted-foreground">
                Lançamentos sem categoria — toque num deles para ir categorizar em Transações.
              </p>
              <div className="space-y-0 pt-2">
                {(pendingQuery.data ?? []).map((transaction) => (
                  <Link
                    key={transaction.id}
                    to="/"
                    className="flex items-center justify-between gap-2 border-b py-2 text-sm hover:bg-slate-50"
                  >
                    <span className="min-w-0 truncate">{transaction.description}</span>
                    <strong className="shrink-0">
                      {formatCurrency(Number(transaction.amount))}
                    </strong>
                  </Link>
                ))}
                {(pendingQuery.data ?? []).length === 0 ? (
                  <p className="py-1 text-sm text-muted-foreground">Nada pendente de revisão.</p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-emerald-700" />
              Próximos eventos
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Link to="/calendario">Ver calendário</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta ou compromisso nos próximos {UPCOMING_BILLS_WINDOW_DAYS} dias.
              </p>
            ) : (
              upcomingItems.map((item) => {
                if (item.kind === "bill") {
                  const occurrence = item.occurrence;
                  const state = billOccurrenceState(occurrence);
                  const billColor = occurrence.category_color ?? "#64748b";
                  const BillIcon = categoryIconFor(occurrence.category_icon, "expense");
                  return (
                    <div
                      key={`bill-${occurrence.id}`}
                      className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${billColor}1f`, color: billColor }}
                        >
                          <BillIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate">{occurrence.bill_name}</p>
                          <p
                            className={cn(
                              "text-xs",
                              state.tone === "warning" ? "text-amber-700" : "text-muted-foreground",
                            )}
                          >
                            {state.label}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <strong>{formatCurrency(occurrence.expected_amount)}</strong>
                        {occurrence.status === "pending" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Dar baixa"
                            title="Dar baixa"
                            onClick={() => setSettlingOccurrence(occurrence)}
                          >
                            <HandCoins className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                }
                const occurrence = item.occurrence;
                const familyMember = occurrence.family_member_id
                  ? (familyMembersQuery.data ?? []).find(
                      (m) => m.id === occurrence.family_member_id,
                    )
                  : null;
                const memberColor = familyMember?.color ?? occurrence.color ?? "#64748b";
                const EventIcon = eventIconFor(occurrence.icon);
                const memberName = familyMember?.name ?? null;
                return (
                  <Link
                    key={`event-${occurrence.event_id}-${occurrence.occurrence_date}`}
                    to="/calendario"
                    className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0 hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${memberColor}1f`, color: memberColor }}
                      >
                        <EventIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate">{occurrence.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {memberName ? `${memberName} · ` : ""}
                          {occurrence.start_time ? occurrence.start_time.slice(0, 5) : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gastos por membro da família</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(spendingByCreatorQuery.data ?? []).map((row) => {
              const member = (membersQuery.data ?? []).find((m) => m.user_id === row.created_by);
              const profile = (profilesQuery.data ?? []).find((p) => p.id === row.created_by);
              const isMe = row.created_by === currentUserQuery.data?.id;
              const resolvedName = row.created_by
                ? resolveMemberName(member, profile, row.created_by)
                : "Sem autor";
              const label = isMe ? "Eu" : resolvedName;
              const percent = creatorTotal > 0 ? (Number(row.total) / creatorTotal) * 100 : 0;
              return (
                <div key={row.created_by ?? "none"} className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {row.created_by ? (
                        <MemberAvatar
                          name={resolvedName}
                          color={resolveMemberColor(row.created_by, member?.color ?? null)}
                          size="sm"
                        />
                      ) : null}
                      {label}
                    </span>
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

      <SettleBillDialog
        orgId={orgId ?? ""}
        userId={currentUserQuery.data?.id ?? null}
        accounts={accountsQuery.data ?? []}
        categories={categoriesQuery.data ?? []}
        occurrence={settlingOccurrence}
        onClose={() => setSettlingOccurrence(null)}
        onSettled={async () => {
          setSettlingOccurrence(null);
          await queryClient.invalidateQueries({ queryKey: ["dashboard-upcoming-bills", orgId] });
        }}
      />
    </AppShell>
  );
}

/** Mini indicador do card Patrimônio (Contas correntes/Investimentos/
 *  Cartões) — o total sempre visível, o detalhe por conta só aparece num
 *  popover ao clicar, pra não empilhar uma lista inteira de contas sempre
 *  aberta na tela (era o que deixava o card grande demais). Popover em vez
 *  de hover pra funcionar no toque também. */
function PatrimonyStat({
  label,
  total,
  items,
}: {
  label: string;
  total: number;
  items: { key: string; name: string; value: string }[];
}) {
  const trigger = (
    <button
      type="button"
      disabled={items.length === 0}
      className="w-full rounded-lg bg-slate-50 p-3 text-left text-sm transition-colors enabled:hover:bg-slate-100"
    >
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <strong className={total < 0 ? "text-red-700" : "text-emerald-700"}>
        {formatCurrency(total)}
      </strong>
    </button>
  );
  if (items.length === 0) return trigger;
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="center">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{item.name}</span>
            <strong className="shrink-0">{item.value}</strong>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
