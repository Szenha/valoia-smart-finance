import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchAccountStatement } from "@/lib/finance/data";
import { competenceMonthDateOnly, formatDateBR, localToday } from "@/lib/finance/date-utils";
import { formatCurrency, type AccountRow } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type Props = {
  orgId: string;
  /** null fecha o diálogo. */
  account: AccountRow | null;
  onClose: () => void;
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function monthLabel(monthStart: string): string {
  const [year, month] = monthStart.split("-").map(Number);
  const label = MONTH_LABEL_FORMATTER.format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Extrato de um cartão de crédito, agrupado por mês de competência (mesma
 * regra de `card_summary`/`competence_month`) — mostra exatamente quais
 * lançamentos compõem "Fatura atual" e "Parcelas futuras" no card de
 * Contas e cartões, pra dar pra conferir os totais.
 */
export function CardStatementDialog({ orgId, account, onClose }: Props) {
  const statementQuery = useQuery({
    queryKey: ["account-statement", orgId, account?.account_key, account?.kind],
    enabled: !!orgId && !!account,
    queryFn: () => fetchAccountStatement(orgId, account!.account_key, account!.kind),
  });

  const closingDay = account?.closing_day ?? null;
  const currentCompetenceMonth = competenceMonthDateOnly(localToday(), closingDay);
  const transactions = statementQuery.data ?? [];

  const groups = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const competenceMonth = competenceMonthDateOnly(t.posted_at, closingDay);
    const list = groups.get(competenceMonth) ?? [];
    list.push(t);
    groups.set(competenceMonth, list);
  }
  const sortedMonths = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

  function groupLabel(competenceMonth: string): {
    title: string;
    tone: "current" | "future" | "past";
  } {
    if (competenceMonth === currentCompetenceMonth)
      return { title: "Fatura atual", tone: "current" };
    if (competenceMonth > currentCompetenceMonth) {
      return { title: `Parcelas futuras — ${monthLabel(competenceMonth)}`, tone: "future" };
    }
    return { title: `Fatura de ${monthLabel(competenceMonth)}`, tone: "past" };
  }

  return (
    <Dialog open={!!account} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extrato — {account?.name}</DialogTitle>
          <DialogDescription>
            Lançamentos agrupados por fatura (fecha dia {account?.closing_day ?? "—"}) — confira o
            que compõe a fatura atual e as parcelas futuras.
          </DialogDescription>
        </DialogHeader>

        {statementQuery.error ? (
          <p className="p-4 text-center text-sm text-red-700">
            Não foi possível carregar o extrato:{" "}
            {statementQuery.error instanceof Error
              ? statementQuery.error.message
              : String(statementQuery.error)}
          </p>
        ) : transactions.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum lançamento nesse cartão ainda.
          </p>
        ) : (
          <div className="space-y-4">
            {sortedMonths.map((competenceMonth) => {
              const items = groups.get(competenceMonth)!;
              const total = items.reduce((sum, t) => sum + Math.abs(t.amount), 0);
              const { title, tone } = groupLabel(competenceMonth);
              return (
                <div key={competenceMonth} className="rounded-lg border border-slate-200">
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-t-lg px-3 py-2 text-sm",
                      tone === "current" && "bg-emerald-50 text-emerald-800",
                      tone === "future" && "bg-amber-50 text-amber-800",
                      tone === "past" && "bg-slate-50 text-slate-600",
                    )}
                  >
                    <strong>{title}</strong>
                    <strong>{formatCurrency(total)}</strong>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate">
                            <span className="inline-flex items-center gap-1.5">
                              {t.installment_plan_id ? (
                                <Layers className="h-3 w-3 shrink-0 text-slate-400" />
                              ) : null}
                              {t.description}
                              {t.installment_plan_id && t.installment_number
                                ? ` (parcela ${t.installment_number})`
                                : ""}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateBR(t.posted_at)}
                          </p>
                        </div>
                        <strong className="shrink-0 tabular-nums">
                          {formatCurrency(Math.abs(t.amount))}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
