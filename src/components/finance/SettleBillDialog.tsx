import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { leafCategoryOptions } from "@/lib/finance/categories";
import { formatDateBR, localToday } from "@/lib/finance/date-utils";
import { fetchTransactions, settleRecurringBillOccurrence } from "@/lib/finance/data";
import type { AccountRow, CategoryRow, RecurringBillOccurrenceRow } from "@/lib/finance/types";
import { formatCurrency } from "@/lib/finance/types";

const MATCH_WINDOW_DAYS = 10;

type Props = {
  orgId: string;
  userId: string | null;
  accounts: AccountRow[];
  categories: CategoryRow[];
  /** null fecha o diálogo. */
  occurrence: RecurringBillOccurrenceRow | null;
  onClose: () => void;
  /** Chamado depois da baixa (sucesso) pra cada tela invalidar suas
   *  próprias queries — Contas Fixas e Dashboard usam chaves diferentes. */
  onSettled: () => void;
};

/** "Baixar" uma conta fixa: registra data/valor/conta do pagamento e — a
 *  menos que vincule a um lançamento já existente — cria a movimentação de
 *  verdade (Transações, saldo de conta, relatórios). Compartilhado entre
 *  Planejamento > Contas fixas e o card "Próximos eventos" do Dashboard. */
export function SettleBillDialog({
  orgId,
  userId,
  accounts,
  categories,
  occurrence,
  onClose,
  onSettled,
}: Props) {
  const queryClient = useQueryClient();
  const categoryItems = leafCategoryOptions(categories);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidAt, setPaidAt] = useState(localToday());
  const [accountKey, setAccountKey] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [linkedTransactionId, setLinkedTransactionId] = useState("none");

  const transactionsQuery = useQuery({
    queryKey: ["transactions", orgId],
    enabled: !!orgId && !!occurrence,
    queryFn: () => fetchTransactions(orgId),
  });

  useEffect(() => {
    if (!occurrence) return;
    setPaidAmount(String(occurrence.expected_amount));
    setPaidAt(localToday());
    const defaultAccount =
      accounts.find((account) => account.account_key === occurrence.account_id) ?? accounts[0];
    setAccountKey(defaultAccount?.account_key ?? "");
    setCategoryId(occurrence.category_id ?? "none");
    setLinkedTransactionId("none");
    // Só quando a ocorrência muda — não a cada render (accounts é uma nova
    // array a cada fetch, entraria em loop se estivesse nas deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occurrence?.id]);

  function candidateTransactions() {
    if (!occurrence) return [];
    const dueTime = new Date(occurrence.due_date).getTime();
    const windowMs = MATCH_WINDOW_DAYS * 86_400_000;
    return (transactionsQuery.data ?? [])
      .filter((t) => Number(t.amount) < 0)
      .filter((t) => Math.abs(new Date(t.posted_at).getTime() - dueTime) <= windowMs)
      .sort(
        (a, b) =>
          Math.abs(new Date(a.posted_at).getTime() - dueTime) -
          Math.abs(new Date(b.posted_at).getTime() - dueTime),
      )
      .slice(0, 15);
  }

  const selectedAccount = accounts.find((account) => account.account_key === accountKey);

  const settleMutation = useMutation({
    mutationFn: async () => {
      if (!occurrence) return;
      const amount = Number(paidAmount.replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Informe um valor pago válido.");
      }
      await settleRecurringBillOccurrence(orgId, occurrence.id, {
        billName: occurrence.bill_name,
        paidAmount: amount,
        paidAt,
        paidBy: userId,
        linkedTransactionId: linkedTransactionId === "none" ? null : linkedTransactionId,
        accountKey: selectedAccount?.account_key ?? null,
        accountKind: selectedAccount?.kind ?? null,
        categoryId: categoryId === "none" ? null : categoryId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
      onSettled();
    },
  });

  return (
    <Dialog open={!!occurrence} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar baixa</DialogTitle>
          <DialogDescription>{occurrence?.bill_name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor pago</Label>
              <Input
                type="number"
                step="0.01"
                autoFocus
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
              />
            </div>
            <div>
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Conta usada</Label>
              <Select
                value={accountKey}
                onValueChange={setAccountKey}
                disabled={linkedTransactionId !== "none"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.account_key}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria (opcional)</Label>
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={linkedTransactionId !== "none"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categoryItems.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Vincular a um lançamento existente (opcional)</Label>
            <Select value={linkedTransactionId} onValueChange={setLinkedTransactionId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum — criar nova movimentação</SelectItem>
                {candidateTransactions().map((transaction) => (
                  <SelectItem key={transaction.id} value={transaction.id}>
                    {formatDateBR(transaction.posted_at)} · {transaction.description} ·{" "}
                    {formatCurrency(Number(transaction.amount))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {linkedTransactionId === "none"
                ? "Sem vínculo, cria uma movimentação nova na conta escolhida acima."
                : "Vincular evita duplicar o lançamento: a baixa passa a apontar para a transação que já existe, em vez de criar um registro novo."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => settleMutation.mutate()}
            disabled={
              !paidAmount ||
              (linkedTransactionId === "none" && !accountKey) ||
              settleMutation.isPending
            }
          >
            Confirmar pagamento
          </Button>
        </DialogFooter>
        {settleMutation.error ? (
          <p className="text-sm text-red-700">
            {settleMutation.error instanceof Error
              ? settleMutation.error.message
              : String(settleMutation.error)}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
