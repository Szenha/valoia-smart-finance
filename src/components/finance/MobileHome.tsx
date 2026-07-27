import { CalendarClock } from "lucide-react";
import { StatTile } from "@/components/finance/StatTile";
import { formatDateBR } from "@/lib/finance/date-utils";
import type { DashboardMonthSummary } from "@/lib/finance/data";
import { sumExpensesInRange, weekStartDateOnly } from "@/lib/finance/post-save-insight";
import { formatCurrency, type RecurringBillOccurrenceRow, type TxnRow } from "@/lib/finance/types";

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
export function MobileHome({
  displayName,
  summary,
  transactions,
  upcomingBills,
  today,
}: {
  displayName: string;
  summary: DashboardMonthSummary | null | undefined;
  transactions: Pick<TxnRow, "amount" | "type" | "posted_at">[];
  upcomingBills: RecurringBillOccurrenceRow[];
  today: string;
}) {
  const spentToday = sumExpensesInRange(transactions, today, today);
  const spentWeek = sumExpensesInRange(transactions, weekStartDateOnly(today), today);

  return (
    <div className="flex flex-col gap-4 lg:hidden">
      <div>
        <h1 className="text-lg font-semibold text-slate-950">Olá, {firstName(displayName)}.</h1>
        <p className="text-sm text-slate-500">Aqui está o resumo de hoje.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Gasto hoje" value={formatCurrency(spentToday)} tone="expense" compact />
        <StatTile
          label="Gasto na semana"
          value={formatCurrency(spentWeek)}
          tone="expense"
          compact
        />
        <StatTile
          label="Receitas do mês"
          value={formatCurrency(summary?.income ?? 0)}
          tone="income"
          compact
        />
        <StatTile
          label="Saldo do mês"
          value={formatCurrency(summary?.balance ?? 0)}
          tone={(summary?.balance ?? 0) >= 0 ? "income" : "expense"}
          compact
        />
      </div>

      {upcomingBills.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Vence em breve
          </p>
          <div className="flex flex-col gap-2">
            {upcomingBills.slice(0, 3).map((occurrence) => (
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
    </div>
  );
}
