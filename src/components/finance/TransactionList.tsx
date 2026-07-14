import { useState } from "react";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Layers,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
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
import { categoryIconFor } from "@/lib/finance/category-icons";
import {
  accountKindIcon,
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
  onDelete?: (txn: TxnRow) => void;
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
  onDelete,
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
      <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Transações</CardTitle>
          <p className="text-sm text-muted-foreground">{displayed.length} lançamento(s)</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Select value={selectedCreator} onValueChange={setSelectedCreator}>
            <SelectTrigger className="w-full sm:w-[180px]">
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
            <SelectTrigger className="w-full sm:w-[220px]">
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
            const isIncome = transaction.amount >= 0;
            const amountClass = isIncome ? "text-emerald-700" : "text-red-700";
            const sideBarClass = isIncome ? "bg-emerald-500" : "bg-red-500";
            const TypeIcon = isIncome ? ArrowUpCircle : ArrowDownCircle;
            const CategoryIcon = categoryIconFor(category?.icon, category?.type ?? "expense");
            const AccountKindIcon = accountKindIcon(String(transaction.account_kind));
            const categoryPillStyle = category?.color
              ? { backgroundColor: `${category.color}1a`, color: category.color }
              : undefined;
            const categoryPillClass = category?.color
              ? "border border-transparent"
              : `${colorForCategory(category, categoryIndex)} border border-transparent text-white`;
            return (
              <div
                key={transaction.id}
                className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
              >
                <div className={`w-1.5 shrink-0 ${sideBarClass}`} />
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <TypeIcon
                        className={`mt-0.5 h-5 w-5 shrink-0 ${isIncome ? "text-emerald-600" : "text-red-600"}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{transaction.description || "-"}</p>
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          {new Date(transaction.posted_at).toLocaleDateString("pt-BR")} ·{" "}
                          <AccountKindIcon className="h-3 w-3" />
                          {accountKindLabel[String(transaction.account_kind)] ??
                            transaction.account_kind}
                        </p>
                      </div>
                    </div>
                    <strong className={`shrink-0 text-lg ${amountClass}`}>
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </strong>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {isEditing ? (
                      <Select
                        defaultValue={transaction.category_id ?? "none"}
                        onValueChange={(value) => {
                          setEditingCategoryFor(null);
                          if (value !== "none") onCategoryChange(transaction, value);
                        }}
                      >
                        <SelectTrigger className="h-7 w-[180px]">
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
                      <button
                        type="button"
                        disabled={consolidated}
                        onClick={() => setEditingCategoryFor(transaction.id)}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${categoryPillClass}`}
                        style={categoryPillStyle}
                      >
                        <CategoryIcon className="h-3 w-3" />
                        {categoryPath(categories, transaction.category_id)}
                      </button>
                    )}
                    <Badge
                      variant={transaction.needs_review ? "secondary" : "outline"}
                      className="rounded-full"
                    >
                      {transaction.needs_review ? (
                        <AlertCircle className="mr-1 h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      {transaction.needs_review ? "Revisar" : "OK"}
                    </Badge>
                    {transaction.installment_plan_id ? (
                      <Badge variant="outline" className="rounded-full">
                        <Layers className="mr-1 h-3 w-3" />
                        {transaction.installment_number
                          ? `${transaction.installment_number} parcela`
                          : "Parcelado"}
                      </Badge>
                    ) : null}
                    {consolidated ? (
                      <Badge variant="secondary" className="rounded-full">
                        <Lock className="mr-1 h-3 w-3" />
                        Consolidado
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                    <p className="text-xs text-muted-foreground">
                      {creatorLabel(transaction.created_by)}
                      {consolidated ? " · período fechado" : ""}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={consolidated}
                        aria-label="Editar categoria"
                        onClick={() => setEditingCategoryFor(transaction.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {onDelete ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          disabled={consolidated}
                          aria-label="Excluir lançamento"
                          onClick={() => {
                            if (window.confirm("Excluir este lançamento?")) onDelete(transaction);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
