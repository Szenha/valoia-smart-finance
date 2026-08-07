import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchAccountStatement } from "@/lib/finance/data";
import { formatDateBR } from "@/lib/finance/date-utils";
import { formatCurrency, type AccountRow } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type Props = {
  orgId: string;
  /** null fecha o diálogo. */
  account: AccountRow | null;
  onClose: () => void;
};

/**
 * Extrato de uma conta corrente/investimento — todas as transações lançadas
 * nela, com saldo corrente acumulado linha a linha, pra dar pra conferir
 * visualmente o "Saldo atual" mostrado no card (mesma fórmula da RPC
 * account_balances: saldo inicial + transações depois da data de
 * referência).
 */
export function AccountStatementDialog({ orgId, account, onClose }: Props) {
  const statementQuery = useQuery({
    queryKey: ["account-statement", orgId, account?.account_key, account?.kind],
    enabled: !!orgId && !!account,
    queryFn: () => fetchAccountStatement(orgId, account!.account_key, account!.kind),
  });

  const initialBalance = account?.initial_balance ?? 0;
  const initialBalanceDate = account?.initial_balance_date ?? null;
  const allTransactions = statementQuery.data ?? [];
  // Só entram no saldo corrente as transações depois da data de referência —
  // mesmo corte usado por account_balances (t.posted_at::date > initial_balance_date).
  // Anteriores aparecem no extrato pra contexto, mas fora do acumulado.
  let running = initialBalance;
  const rows = allTransactions.map((t) => {
    const countsTowardBalance =
      !initialBalanceDate || t.posted_at.slice(0, 10) > initialBalanceDate;
    if (countsTowardBalance) running += t.amount;
    return { ...t, runningBalance: countsTowardBalance ? running : null };
  });
  const finalBalance = running;

  return (
    <Dialog open={!!account} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extrato — {account?.name}</DialogTitle>
          <DialogDescription>
            Todas as movimentações da conta, com saldo acumulado — use para conferir o saldo atual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">
              Saldo inicial{initialBalanceDate ? ` em ${formatDateBR(initialBalanceDate)}` : ""}
            </p>
            <strong>{formatCurrency(initialBalance)}</strong>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Saldo atual</p>
            <strong className={finalBalance < 0 ? "text-red-700" : "text-emerald-700"}>
              {formatCurrency(finalBalance)}
            </strong>
          </div>
        </div>

        {statementQuery.error ? (
          <p className="p-4 text-center text-sm text-red-700">
            Não foi possível carregar o extrato:{" "}
            {statementQuery.error instanceof Error
              ? statementQuery.error.message
              : String(statementQuery.error)}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma movimentação lançada nessa conta ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Data</th>
                  <th className="py-2 pr-2 font-medium">Descrição</th>
                  <th className="py-2 pr-2 text-right font-medium">Valor</th>
                  <th className="py-2 pl-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.id}
                    className={cn("border-b last:border-b-0", !t.runningBalance && "opacity-50")}
                  >
                    <td className="whitespace-nowrap py-2 pr-2 text-muted-foreground">
                      {formatDateBR(t.posted_at)}
                    </td>
                    <td className="max-w-[220px] truncate py-2 pr-2">
                      <span className="inline-flex items-center gap-1.5">
                        {t.type === "MANUAL_TRANSFER" ? (
                          <ArrowLeftRight className="h-3 w-3 shrink-0 text-slate-400" />
                        ) : null}
                        {t.description}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap py-2 pr-2 text-right tabular-nums",
                        t.amount < 0 ? "text-red-700" : "text-emerald-700",
                      )}
                    >
                      {formatCurrency(t.amount)}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">
                      {t.runningBalance != null ? formatCurrency(t.runningBalance) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
