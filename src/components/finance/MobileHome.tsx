import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { StatTile } from "@/components/finance/StatTile";
import { TransactionDrilldownDialog } from "@/components/finance/TransactionDrilldownDialog";
import { formatDateBR, startOfMonthDateOnly } from "@/lib/finance/date-utils";
import type { DashboardMonthSummary } from "@/lib/finance/data";
import { eventIconFor } from "@/lib/finance/event-icons";
import { sumExpensesInRange, weekStartDateOnly } from "@/lib/finance/post-save-insight";
import {
  formatCurrency,
  type CalendarEventOccurrence,
  type CategoryRow,
  type FamilyMemberRow,
  type RecurringBillOccurrenceRow,
  type TxnRow,
} from "@/lib/finance/types";

type DrilldownKind = "today" | "week" | "month" | "balance" | null;

/** Primeiro nome, pra uma saudação curta — "Olá, Samuel." em vez do nome
 *  completo ou do e-mail. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

/**
 * Início do mobile — saudação + resumo curto, mostrado só abaixo de 768px
 * (routes/index.tsx). A lista completa de lançamentos continua logo abaixo
 * na mesma página, então "últimos lançamentos" não é duplicado aqui.
 * Todos os números vêm de dado real já carregado ou de RPCs existentes
 * (dashboard_month_summary, recurring_bills_upcoming) — nada é inventado.
 */
type MobileHomeTxn = Pick<
  TxnRow,
  "id" | "description" | "amount" | "type" | "posted_at" | "category_id" | "currency"
>;

function isTransferRow(t: Pick<MobileHomeTxn, "type">): boolean {
  return t.type === "MANUAL_TRANSFER";
}

function expenseRowsInRange(transactions: MobileHomeTxn[], start: string, end: string) {
  return transactions.filter((t) => {
    if (isTransferRow(t) || t.amount >= 0) return false;
    const day = t.posted_at.slice(0, 10);
    return day >= start && day <= end;
  });
}

function incomeRowsInRange(transactions: MobileHomeTxn[], start: string, end: string) {
  return transactions.filter((t) => {
    if (isTransferRow(t) || t.amount < 0) return false;
    const day = t.posted_at.slice(0, 10);
    return day >= start && day <= end;
  });
}

export function MobileHome({
  displayName,
  summary,
  transactions,
  categories,
  upcomingBills,
  upcomingEvents,
  familyMembers,
  today,
}: {
  displayName: string;
  summary: DashboardMonthSummary | null | undefined;
  transactions: MobileHomeTxn[];
  categories: Pick<CategoryRow, "id" | "name">[];
  upcomingBills: RecurringBillOccurrenceRow[];
  upcomingEvents: CalendarEventOccurrence[];
  familyMembers: FamilyMemberRow[];
  today: string;
}) {
  const monthStart = startOfMonthDateOnly(today);
  const weekStart = weekStartDateOnly(today);
  const spentToday = sumExpensesInRange(transactions, today, today);
  const spentWeek = sumExpensesInRange(transactions, weekStart, today);
  const spentMonth = sumExpensesInRange(transactions, monthStart, today);
  // recurring_bills_upcoming também traz pagas/puladas dentro da janela de
  // dias pedida (só ocorrências vencidas e pendentes furam a janela) — "Vence
  // em breve" é só o que ainda falta pagar, então filtra aqui.
  const pendingUpcomingBills = upcomingBills.filter((bill) => bill.status === "pending");

  const [drilldown, setDrilldown] = useState<DrilldownKind>(null);
  const drilldownRows =
    drilldown === "today"
      ? expenseRowsInRange(transactions, today, today)
      : drilldown === "week"
        ? expenseRowsInRange(transactions, weekStart, today)
        : drilldown === "month"
          ? expenseRowsInRange(transactions, monthStart, today)
          : drilldown === "balance"
            ? [
                ...incomeRowsInRange(transactions, monthStart, today),
                ...expenseRowsInRange(transactions, monthStart, today),
              ].sort((a, b) => b.posted_at.localeCompare(a.posted_at))
            : [];
  const drilldownTitle =
    drilldown === "today"
      ? "Gasto hoje"
      : drilldown === "week"
        ? "Gasto na semana"
        : drilldown === "month"
          ? "Gasto no mês"
          : "Saldo do mês";

  return (
    <div className="flex flex-col gap-4 lg:hidden">
      <div>
        <h1 className="text-lg font-semibold text-slate-950">Olá, {firstName(displayName)}.</h1>
        <p className="text-sm text-slate-500">Aqui está o resumo de hoje.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Gasto hoje"
          value={formatCurrency(spentToday)}
          tone="expense"
          compact
          onClick={() => setDrilldown("today")}
        />
        <StatTile
          label="Gasto na semana"
          value={formatCurrency(spentWeek)}
          tone="expense"
          compact
          onClick={() => setDrilldown("week")}
        />
        <StatTile
          label="Gasto no mês"
          value={formatCurrency(spentMonth)}
          tone="expense"
          compact
          onClick={() => setDrilldown("month")}
        />
        <StatTile
          label="Saldo do mês"
          value={formatCurrency(summary?.balance ?? 0)}
          tone={(summary?.balance ?? 0) >= 0 ? "income" : "expense"}
          compact
          onClick={() => setDrilldown("balance")}
        />
      </div>

      {pendingUpcomingBills.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Vence em breve
          </p>
          <div className="flex flex-col gap-2">
            {pendingUpcomingBills.slice(0, 3).map((occurrence) => (
              <div key={occurrence.id} className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {occurrence.bill_name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateBR(occurrence.due_date)}
                </span>
                <strong className="shrink-0 tabular-nums">
                  {formatCurrency(occurrence.expected_amount)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {upcomingEvents.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Próximos eventos
          </p>
          <div className="flex flex-col gap-2">
            {upcomingEvents.slice(0, 3).map((occurrence) => {
              const familyMember = occurrence.family_member_id
                ? familyMembers.find((m) => m.id === occurrence.family_member_id)
                : null;
              const memberColor = familyMember?.color ?? occurrence.color ?? "#64748b";
              const EventIcon = eventIconFor(occurrence.icon);
              return (
                <Link
                  key={`${occurrence.event_id}-${occurrence.occurrence_date}`}
                  to="/calendario"
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${memberColor}1f`, color: memberColor }}
                  >
                    <EventIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{occurrence.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {familyMember?.name ? `${familyMember.name} · ` : ""}
                    {formatDateBR(occurrence.occurrence_date)}
                    {occurrence.start_time ? ` · ${occurrence.start_time.slice(0, 5)}` : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <TransactionDrilldownDialog
        open={!!drilldown}
        onOpenChange={(open) => !open && setDrilldown(null)}
        title={drilldownTitle}
        rows={drilldownRows}
        categories={categories}
      />
    </div>
  );
}
