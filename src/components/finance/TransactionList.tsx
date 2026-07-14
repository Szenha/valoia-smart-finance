import { useState } from "react";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryPath, leafCategoryOptions } from "@/lib/finance/categories";
import {
  accountKindLabel,
  accountLabel,
  formatCurrency,
  type CategoryRow,
  type HouseholdMemberRow,
  type TxnRow,
} from "@/lib/finance/types";

type Props = {
  transactions: TxnRow[];
  categories: CategoryRow[];
  members: HouseholdMemberRow[];
  currentUserId: string | null;
  onCategoryChange: (txn: TxnRow, categoryId: string) => void;
};

const CATEGORY_COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-lime-500",
  "bg-orange-500",
];

function colorForCategory(category: CategoryRow | undefined, index: number) {
  if (category?.color) return "";
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function creatorLabel(createdBy?: string | null) {
  if (!createdBy) return "Sem autor";
  return `Criado por ${createdBy.slice(0, 8)}`;
}

function memberLabel(memberId: string, currentUserId: string | null) {
  if (memberId === currentUserId) return "Eu";
  return `Outro membro ${memberId.slice(0, 6)}`;
}

export function TransactionList({
  transactions,
  categories,
  members,
  currentUserId,
  onCategoryChange,
}: Props) {
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedCreator, setSelectedCreator] = useState("all");
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null);
  const categoryItems = leafCategoryOptions(categories);
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
      ? transactions.filter(
          (transaction) => selectedCreator === "all" || transaction.created_by === selectedCreator,
        )
      : transactions.filter(
          (transaction) =>
            transaction.account_id === selectedAccount &&
            (selectedCreator === "all" || transaction.created_by === selectedCreator),
        );
  const income = displayed.reduce((sum, t) => (t.amount > 0 ? sum + t.amount : sum), 0);
  const expenses = displayed.reduce((sum, t) => (t.amount < 0 ? sum + Math.abs(t.amount) : sum), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Transações</CardTitle>
          <p className="text-sm text-muted-foreground">{displayed.length} lançamento(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedCreator} onValueChange={setSelectedCreator}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {memberLabel(member.user_id, currentUserId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-6 border-b pb-4 text-sm">
          <strong className="text-emerald-700">Entradas {formatCurrency(income)}</strong>
          <strong className="text-red-700">Saídas {formatCurrency(expenses)}</strong>
          <strong>Saldo {formatCurrency(income - expenses)}</strong>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {displayed.map((transaction) => {
            const category = categories.find((c) => c.id === transaction.category_id);
            const categoryIndex = Math.max(
              categories.findIndex((c) => c.id === transaction.category_id),
              0,
            );
            const isEditing = editingCategoryFor === transaction.id;
            const consolidated = transaction.consolidation_status === "consolidado";
            const amountClass = transaction.amount < 0 ? "text-red-700" : "text-emerald-700";
            return (
              <div
                key={transaction.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{transaction.description || "-"}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(transaction.posted_at).toLocaleDateString("pt-BR")} ·{" "}
                      {accountKindLabel[String(transaction.account_kind)] ??
                        transaction.account_kind}
                    </p>
                  </div>
                  <strong className={`shrink-0 text-lg ${amountClass}`}>
                    {formatCurrency(transaction.amount, transaction.currency)}
                  </strong>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {isEditing ? (
                    <Select
                      defaultValue={transaction.category_id ?? "none"}
                      onValueChange={(value) => {
                        setEditingCategoryFor(null);
                        if (value !== "none") onCategoryChange(transaction, value);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem categoria</SelectItem>
                        {categoryItems.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-2 px-2"
                      disabled={consolidated}
                      onClick={() => setEditingCategoryFor(transaction.id)}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${colorForCategory(
                          category,
                          categoryIndex,
                        )}`}
                        style={category?.color ? { backgroundColor: category.color } : undefined}
                      />
                      {categoryPath(categories, transaction.category_id)}
                    </Button>
                  )}
                  <Badge variant={transaction.needs_review ? "secondary" : "outline"}>
                    {transaction.needs_review ? (
                      <AlertCircle className="mr-1 h-3 w-3" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    )}
                    {transaction.needs_review ? "Revisar" : "OK"}
                  </Badge>
                  {transaction.installment_plan_id ? (
                    <Badge variant="outline">
                      {transaction.installment_number
                        ? `${transaction.installment_number} parcela`
                        : "Parcelado"}
                    </Badge>
                  ) : null}
                  {consolidated ? (
                    <Badge variant="secondary">
                      <Lock className="mr-1 h-3 w-3" />
                      Consolidado
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {creatorLabel(transaction.created_by)}
                  {consolidated ? " · período fechado; reabra a conciliação para editar" : ""}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
