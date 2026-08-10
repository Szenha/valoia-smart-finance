import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateBR } from "@/lib/finance/date-utils";
import { formatCurrency, type CategoryRow, type TxnRow } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type DrilldownRow = Pick<
  TxnRow,
  "id" | "description" | "posted_at" | "category_id" | "amount" | "currency"
>;

/** Dialog de "o que compõe esse número" — lista os lançamentos por trás de
 *  um total (entradas, saídas ou saldo). Reaproveitado tanto pelos KPIs de
 *  Transações (TransactionList) quanto pelos cards do início mobile
 *  (MobileHome), pra não duplicar a mesma UI de lista em dois lugares. */
export function TransactionDrilldownDialog({
  open,
  onOpenChange,
  title,
  rows,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: DrilldownRow[];
  categories: Pick<CategoryRow, "id" | "name">[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {rows.length} lançamento(s) que compõem esse número, no período e filtros atuais.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {rows.map((t) => {
            const category = categories.find((c) => c.id === t.category_id);
            const isExpense = t.amount < 0;
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate">{t.description || "-"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateBR(t.posted_at)}
                    {category ? ` · ${category.name}` : ""}
                  </p>
                </div>
                <strong
                  className={cn(
                    "shrink-0 tabular-nums",
                    isExpense
                      ? "rounded-full bg-rose-50 px-2 py-0.5 text-slate-900"
                      : "text-emerald-700",
                  )}
                >
                  {formatCurrency(t.amount, t.currency)}
                </strong>
              </div>
            );
          })}
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum lançamento nesse recorte.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
