import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Layers, Link2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAccountStatement,
  fetchCardFutureCommitments,
  fetchCardInstallmentProjections,
} from "@/lib/finance/data";
import {
  addMonthsToDateOnly,
  competenceMonthDateOnly,
  formatDateBR,
  localToday,
} from "@/lib/finance/date-utils";
import { formatCurrency, type AccountRow } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type Props = {
  orgId: string;
  /** null fecha o diálogo. */
  account: AccountRow | null;
  onClose: () => void;
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
type FutureFilter = "current" | "next" | "future";

function monthLabel(monthStart: string): string {
  const [year, month] = monthStart.split("-").map(Number);
  const label = MONTH_LABEL_FORMATTER.format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function projectionStatusLabel(status: string): string {
  if (status === "linked") return "Lançado";
  if (status === "confirmed") return "Confirmado";
  if (status === "reconciled") return "Conciliado";
  if (status === "divergent") return "Divergente";
  return "Detectado";
}

function projectionStatusIcon(status: string) {
  if (status === "linked") return <Link2 className="h-3 w-3" />;
  if (status === "confirmed" || status === "reconciled")
    return <CheckCircle2 className="h-3 w-3" />;
  if (status === "divergent") return <AlertTriangle className="h-3 w-3" />;
  return <Clock3 className="h-3 w-3" />;
}

/**
 * Extrato de um cartão de crédito, agrupado por mês de competência (mesma
 * regra de `card_summary`/`competence_month`) — mostra exatamente quais
 * lançamentos compõem "Fatura atual" e "Parcelas futuras" no card de
 * Contas e cartões, pra dar pra conferir os totais.
 */
export function CardStatementDialog({ orgId, account, onClose }: Props) {
  const [futureFilter, setFutureFilter] = useState<FutureFilter>("future");
  const statementQuery = useQuery({
    queryKey: ["account-statement", orgId, account?.account_key, account?.kind],
    enabled: !!orgId && !!account,
    queryFn: () => fetchAccountStatement(orgId, account!.account_key, account!.kind),
  });
  const commitmentsQuery = useQuery({
    queryKey: ["card-future-commitments", orgId],
    enabled: !!orgId && !!account,
    queryFn: () => fetchCardFutureCommitments(orgId),
  });
  const projectionsQuery = useQuery({
    queryKey: ["card-installment-projections", orgId, account?.account_key],
    enabled: !!orgId && !!account,
    queryFn: () => fetchCardInstallmentProjections(orgId, account!.account_key),
  });

  const closingDay = account?.closing_day ?? null;
  const currentCompetenceMonth = competenceMonthDateOnly(localToday(), closingDay);
  const nextCompetenceMonth = addMonthsToDateOnly(currentCompetenceMonth, 1);
  const transactions = statementQuery.data ?? [];
  const futureCommitments = (commitmentsQuery.data ?? []).filter(
    (row) => row.account_key === account?.account_key,
  );
  const commitmentByMonth = new Map(futureCommitments.map((row) => [row.competence_month, row]));
  const projections = (projectionsQuery.data ?? []).filter((projection) => {
    if (futureFilter === "current")
      return projection.expected_competence_month === currentCompetenceMonth;
    if (futureFilter === "next")
      return projection.expected_competence_month === nextCompetenceMonth;
    return projection.expected_competence_month > currentCompetenceMonth;
  });

  const groups = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const competenceMonth = competenceMonthDateOnly(t.posted_at, closingDay);
    const list = groups.get(competenceMonth) ?? [];
    list.push(t);
    groups.set(competenceMonth, list);
  }
  const sortedMonths = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
  const projectionGroups = new Map<string, typeof projections>();
  for (const projection of projections) {
    const list = projectionGroups.get(projection.expected_competence_month) ?? [];
    list.push(projection);
    projectionGroups.set(projection.expected_competence_month, list);
  }
  const sortedProjectionMonths = Array.from(
    new Set([...projectionGroups.keys(), ...futureCommitments.map((row) => row.competence_month)]),
  )
    .filter((month) => {
      if (futureFilter === "current") return month === currentCompetenceMonth;
      if (futureFilter === "next") return month === nextCompetenceMonth;
      return month > currentCompetenceMonth;
    })
    .sort((a, b) => a.localeCompare(b));

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

        {statementQuery.error || projectionsQuery.error || commitmentsQuery.error ? (
          <p className="p-4 text-center text-sm text-red-700">
            Não foi possível carregar o extrato do cartão.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={futureFilter === "current" ? "default" : "outline"}
                onClick={() => setFutureFilter("current")}
              >
                Fatura atual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={futureFilter === "next" ? "default" : "outline"}
                onClick={() => setFutureFilter("next")}
              >
                Próxima
              </Button>
              <Button
                type="button"
                size="sm"
                variant={futureFilter === "future" ? "default" : "outline"}
                onClick={() => setFutureFilter("future")}
              >
                Futuras
              </Button>
            </div>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Comprometimento por fatura</h3>
              {sortedProjectionMonths.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-muted-foreground">
                  Nenhuma parcela projetada por fatura importada neste filtro.
                </p>
              ) : (
                sortedProjectionMonths.map((month) => {
                  const summary = commitmentByMonth.get(month);
                  const items = projectionGroups.get(month) ?? [];
                  return (
                    <div key={month} className="rounded-lg border border-slate-200">
                      <div className="grid gap-2 rounded-t-lg bg-slate-50 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]">
                        <div>
                          <strong>{monthLabel(month)}</strong>
                          <p className="text-xs text-muted-foreground">
                            Sistema {formatCurrency(summary?.total_internal_transactions ?? 0)} ·
                            Importado {formatCurrency(summary?.total_detected_projections ?? 0)} ·
                            Divergente {formatCurrency(summary?.total_divergent ?? 0)}
                          </p>
                        </div>
                        <strong className="tabular-nums">
                          {formatCurrency(summary?.total_commitment_without_double_count ?? 0)}
                        </strong>
                      </div>
                      <div className="grid gap-2 p-2">
                        {items.map((projection) => (
                          <div
                            key={projection.id}
                            className="grid gap-2 rounded-md border border-slate-100 bg-white p-2 text-sm sm:grid-cols-[1fr_auto]"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="rounded-full">
                                  {projectionStatusIcon(projection.status)}
                                  <span className="ml-1">
                                    {projectionStatusLabel(projection.status)}
                                  </span>
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {projection.linked_transaction_id
                                    ? "Sistema + fatura"
                                    : "Fatura importada"}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 font-medium">
                                {projection.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Parcela {projection.installment_number}/
                                {projection.total_installments} ·{" "}
                                {formatDateBR(projection.expected_posted_at)}
                              </p>
                            </div>
                            <strong className="self-start text-right tabular-nums">
                              {formatCurrency(projection.expected_amount)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </section>

            {transactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum lançamento interno nesse cartão ainda.
              </p>
            ) : null}
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
                              {t.reconciled_statement_item_id ? (
                                <CheckCircle2
                                  className="h-3 w-3 shrink-0 text-emerald-600"
                                  aria-label="Conciliado com extrato"
                                />
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
