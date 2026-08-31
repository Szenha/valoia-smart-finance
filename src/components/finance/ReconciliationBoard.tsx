import { CheckCircle2, CircleAlert, FileText, PlusCircle, Receipt, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateBR } from "@/lib/finance/date-utils";
import { accountLabel, formatCurrency, type TxnRow } from "@/lib/finance/types";
import { computeReconciliationTotals } from "@/lib/reconciliation/totals";
import type { MatchSuggestion, StatementItemRow } from "@/lib/reconciliation/types";

type Props = {
  items: StatementItemRow[];
  transactions: TxnRow[];
  suggestions: MatchSuggestion[];
  busy: boolean;
  source?: string | null;
  onMatch: (item: StatementItemRow, transaction: TxnRow, confidence: number) => void;
  onAccept: (item: StatementItemRow) => void;
  onReview: (item: StatementItemRow) => void;
  onIgnore: (item: StatementItemRow) => void;
};

function statusLabel(status: StatementItemRow["status"]) {
  if (status === "matched") return "Conciliado";
  if (status === "accepted") return "Aceito como novo";
  if (status === "review") return "Pendente de revisão";
  if (status === "ignored") return "Ignorado";
  return "Pendente";
}

function sideBarClass(status: StatementItemRow["status"]) {
  if (status === "matched" || status === "accepted") return "bg-emerald-500";
  if (status === "review") return "bg-amber-500";
  if (status === "ignored") return "bg-slate-500";
  return "bg-slate-300";
}

type StatusFilter = "all" | StatementItemRow["status"];

export function ReconciliationBoard({
  items,
  transactions,
  suggestions,
  busy,
  source,
  onMatch,
  onAccept,
  onReview,
  onIgnore,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const suggestionsByItem = new Map(
    suggestions.map((suggestion) => [suggestion.itemId, suggestion]),
  );
  const transactionsById = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );
  const {
    pendingCount,
    reviewCount,
    ignoredCount,
    statementIncome,
    statementExpense,
    systemIncome,
    systemExpense,
    difference,
    totalsMatch,
  } = computeReconciliationTotals(items, transactions);
  const filteredItems = items.filter(
    (item) => statusFilter === "all" || item.status === statusFilter,
  );
  const batchable = items.filter(
    (item) => item.status === "pending" && suggestionsByItem.get(item.id)?.transactionId,
  );
  const selectedBatchable = batchable.filter((item) => selected.has(item.id));

  function toggleSelected(itemId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function confirmBatch() {
    for (const item of selectedBatchable) {
      const suggestion = suggestionsByItem.get(item.id);
      const transaction = suggestion?.transactionId
        ? transactionsById.get(suggestion.transactionId)
        : null;
      if (transaction) onMatch(item, transaction, suggestion?.confidence ?? 1);
    }
    setSelected(new Set());
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            Conciliação
            {source ? (
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                {source.startsWith("pdf") ? (
                  <Receipt className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                {source.startsWith("pdf") ? "PDF" : "OFX"}
              </span>
            ) : null}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {items.length} item(ns) de extrato · {pendingCount} pendente(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="w-[170px]" aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="matched">Conciliados</SelectItem>
              <SelectItem value="accepted">Aceitos</SelectItem>
              <SelectItem value="review">Revisão</SelectItem>
              <SelectItem value="ignored">Ignorados</SelectItem>
            </SelectContent>
          </Select>
          {batchable.length > 0 ? (
            <Button
              type="button"
              disabled={busy || selectedBatchable.length === 0}
              onClick={confirmBatch}
            >
              Conciliar ({selectedBatchable.length})
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <p className="text-xs text-muted-foreground">Entradas extrato</p>
              <strong className="text-emerald-700">{formatCurrency(statementIncome)}</strong>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saídas extrato</p>
              <strong className="text-red-700">{formatCurrency(statementExpense)}</strong>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entradas sistema</p>
              <strong className="text-emerald-700">{formatCurrency(systemIncome)}</strong>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saídas sistema</p>
              <strong className="text-red-700">{formatCurrency(systemExpense)}</strong>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diferença</p>
              <strong className={totalsMatch ? "text-emerald-700" : "text-amber-700"}>
                {formatCurrency(difference)}
              </strong>
              {totalsMatch ? <p className="text-xs text-emerald-700">Totais batem</p> : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendências</p>
              <strong
                className={pendingCount + reviewCount === 0 ? "text-emerald-700" : "text-amber-700"}
              >
                {pendingCount} abertas · {reviewCount} revisão
              </strong>
              {ignoredCount > 0 ? (
                <p className="text-xs text-slate-500">{ignoredCount} ignorado(s) fora dos totais</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Importe um OFX ou PDF para revisar os itens do extrato contra os lançamentos do dia a
            dia.
          </p>
        ) : null}
        {filteredItems.map((item) => {
          const suggestion = suggestionsByItem.get(item.id);
          const suggestedTransaction = suggestion?.transactionId
            ? transactionsById.get(suggestion.transactionId)
            : null;
          const matchedTransaction = item.matched_transaction_id
            ? transactionsById.get(item.matched_transaction_id)
            : null;
          const canBatch = item.status === "pending" && !!suggestedTransaction;
          return (
            <div
              key={item.id}
              className={`flex overflow-hidden rounded-lg border ${
                item.status === "pending" ? "bg-white" : "bg-muted/35"
              }`}
            >
              <div className={`w-1.5 shrink-0 ${sideBarClass(item.status)}`} />
              <div className="grid flex-1 gap-3 p-3 md:grid-cols-[auto_1fr_1fr_auto]">
                <div className="flex items-start pt-1">
                  {canBatch ? (
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggleSelected(item.id)}
                      aria-label="Selecionar para conciliar em lote"
                    />
                  ) : null}
                </div>
                <div>
                  <Badge
                    variant={
                      item.status === "matched" || item.status === "accepted"
                        ? "default"
                        : item.status === "review"
                          ? "secondary"
                          : "outline"
                    }
                    className="rounded-full"
                  >
                    {item.status === "matched" || item.status === "accepted" ? (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    ) : item.status === "ignored" ? (
                      <XCircle className="mr-1 h-3 w-3" />
                    ) : (
                      <CircleAlert className="mr-1 h-3 w-3" />
                    )}
                    {statusLabel(item.status)}
                  </Badge>
                  <p className="mt-1 font-medium">{item.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateBR(item.posted_at)} ·{" "}
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
                        {formatDateBR(suggestedTransaction.posted_at)} ·{" "}
                        {formatCurrency(Number(suggestedTransaction.amount))}
                      </p>
                      {suggestedTransaction.recurring_bill_occurrence_id ? (
                        <p className="mt-1 text-amber-700">
                          Parece uma conta fixa já paga. Conciliar evita duplicidade.
                        </p>
                      ) : null}
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
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        onMatch(item, suggestedTransaction, suggestion?.confidence ?? 1)
                      }
                    >
                      Conciliar
                    </Button>
                  ) : null}
                  {item.status === "pending" ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => onAccept(item)}
                      >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Aceitar novo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onReview(item)}
                      >
                        Marcar revisão
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => onIgnore(item)}
                      >
                        Ignorar
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
