import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accountKindLabel,
  accountLabel,
  formatCurrency,
  type CategoryRow,
  type TxnRow,
} from "@/lib/finance/types";

type Props = {
  transactions: TxnRow[];
  categories: CategoryRow[];
  onCategoryChange: (txn: TxnRow, categoryId: string) => void;
};

export function TransactionList({ transactions, categories, onCategoryChange }: Props) {
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null);
  const accounts = Array.from(
    new Map(
      transactions.map((t) => [
        `${t.account_id}|${t.account_kind}`,
        { accountId: t.account_id, accountKind: String(t.account_kind) },
      ]),
    ).values(),
  );
  const displayed =
    selectedAccount === "all"
      ? transactions
      : transactions.filter((transaction) => transaction.account_id === selectedAccount);
  const income = displayed.reduce((sum, t) => (t.amount > 0 ? sum + t.amount : sum), 0);
  const expenses = displayed.reduce((sum, t) => (t.amount < 0 ? sum + Math.abs(t.amount) : sum), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Transações</CardTitle>
          <p className="text-sm text-muted-foreground">{displayed.length} lançamento(s)</p>
        </div>
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map((account) => (
              <SelectItem
                key={`${account.accountId}|${account.accountKind}`}
                value={account.accountId}
              >
                {accountLabel(account.accountId, account.accountKind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-6 border-b pb-4 text-sm">
          <strong className="text-emerald-700">Entradas {formatCurrency(income)}</strong>
          <strong className="text-red-700">Saídas {formatCurrency(expenses)}</strong>
          <strong>Saldo {formatCurrency(income - expenses)}</strong>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2">Data</th>
                <th className="p-2">Descrição</th>
                <th className="p-2">Tipo</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2">Conta</th>
                <th className="p-2">Categoria</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((transaction) => {
                const category = categories.find((c) => c.id === transaction.category_id);
                const isEditing = editingCategoryFor === transaction.id;
                return (
                  <tr
                    key={transaction.id}
                    className={transaction.needs_review ? "border-b bg-amber-50" : "border-b"}
                  >
                    <td className="p-2">
                      {new Date(transaction.posted_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="max-w-[360px] truncate p-2">{transaction.description || "-"}</td>
                    <td className="p-2 text-muted-foreground">{transaction.type}</td>
                    <td
                      className={
                        transaction.amount < 0
                          ? "p-2 text-right text-red-700"
                          : "p-2 text-right text-emerald-700"
                      }
                    >
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {accountKindLabel[String(transaction.account_kind)] ??
                        transaction.account_kind}
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <Select
                          defaultValue={transaction.category_id ?? "none"}
                          onValueChange={(value) => {
                            setEditingCategoryFor(null);
                            if (value !== "none") onCategoryChange(transaction, value);
                          }}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem categoria</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCategoryFor(transaction.id)}
                        >
                          {transaction.needs_review ? "⚠ " : ""}
                          {category?.name ?? "Sem categoria"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
