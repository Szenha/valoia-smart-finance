import { CheckCircle2, CircleAlert, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { accountLabel, formatCurrency, type TxnRow } from "@/lib/finance/types";
import type { MatchSuggestion, StatementItemRow } from "@/lib/reconciliation/types";

type Props = {
  items: StatementItemRow[];
  transactions: TxnRow[];
  suggestions: MatchSuggestion[];
  busy: boolean;
  onMatch: (item: StatementItemRow, transaction: TxnRow, confidence: number) => void;
  onAccept: (item: StatementItemRow) => void;
  onReview: (item: StatementItemRow) => void;
};

function statusLabel(status: StatementItemRow["status"]) {
  if (status === "matched") return "Conciliado";
  if (status === "accepted") return "Aceito como novo";
  if (status === "review") return "Pendente de revisão";
  return "Pendente";
}

export function ReconciliationBoard({
  items,
  transactions,
  suggestions,
  busy,
  onMatch,
  onAccept,
  onReview,
}: Props) {
  const suggestionsByItem = new Map(
    suggestions.map((suggestion) => [suggestion.itemId, suggestion]),
  );
  const transactionsById = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );
  const pending = items.filter((item) => item.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conciliação</CardTitle>
        <p className="text-sm text-muted-foreground">
          {items.length} item(ns) de extrato · {pending} pendente(s)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Importe um OFX ou PDF para revisar os itens do extrato contra os lançamentos do dia a
            dia.
          </p>
        ) : null}
        {items.map((item) => {
          const suggestion = suggestionsByItem.get(item.id);
          const suggestedTransaction = suggestion?.transactionId
            ? transactionsById.get(suggestion.transactionId)
            : null;
          const matchedTransaction = item.matched_transaction_id
            ? transactionsById.get(item.matched_transaction_id)
            : null;
          return (
            <div
              key={item.id}
              className={
                item.status === "pending"
                  ? "grid gap-3 border p-3 md:grid-cols-[1fr_1fr_auto]"
                  : "grid gap-3 border bg-muted/35 p-3 md:grid-cols-[1fr_1fr_auto]"
              }
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {item.status === "matched" || item.status === "accepted" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  ) : item.status === "review" ? (
                    <CircleAlert className="h-4 w-4 text-amber-700" />
                  ) : (
                    <CircleAlert className="h-4 w-4 text-muted-foreground" />
                  )}
                  {statusLabel(item.status)}
                </div>
                <p className="mt-1 font-medium">{item.description}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(item.posted_at).toLocaleDateString("pt-BR")} ·{" "}
                  {accountLabel(item.account_id, String(item.account_kind))}
                </p>
                <strong className={item.amount < 0 ? "text-red-700" : "text-emerald-700"}>
                  {formatCurrency(Number(item.amount), item.currency)}
                </strong>
              </div>
              <div className="rounded-md bg-background p-3 text-sm">
                {suggestedTransaction ? (
                  <>
                    <p className="font-medium">Sugestão: {suggestion?.reason}</p>
                    <p>{suggestedTransaction.description}</p>
                    <p className="text-muted-foreground">
                      {new Date(suggestedTransaction.posted_at).toLocaleDateString("pt-BR")} ·{" "}
                      {formatCurrency(Number(suggestedTransaction.amount))}
                    </p>
                  </>
                ) : matchedTransaction ? (
                  <>
                    <p className="font-medium">Vinculado a lançamento existente</p>
                    <p>{matchedTransaction.description}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {suggestion?.reason ?? "Sem sugestão automática."}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {item.status === "pending" && suggestedTransaction ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => onMatch(item, suggestedTransaction, suggestion?.confidence ?? 1)}
                  >
                    Conciliar
                  </Button>
                ) : null}
                {item.status === "pending" ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onAccept(item)}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Aceitar novo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onReview(item)}
                    >
                      Marcar revisão
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
