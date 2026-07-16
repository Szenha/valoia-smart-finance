import { useEffect, useRef, useState } from "react";
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
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { TransactionEditDialog } from "@/components/finance/TransactionEditDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { categoryPath, leafCategoryOptions } from "@/lib/finance/categories";
import { categoryIconFor } from "@/lib/finance/category-icons";
import { resolveMemberColor, resolveMemberName } from "@/lib/finance/member-visuals";
import {
  entrySourceIcon,
  entrySourceLabel,
  INDICATOR_GAP_CLASS,
  INDICATOR_ICON_SIZE_CLASS,
  paymentMethodIcon,
  paymentMethodLabel,
  type EntrySource,
  type PaymentMethod,
} from "@/lib/finance/transactionIcons";
import {
  accountKindIcon,
  accountKindLabel,
  accountLabel,
  formatCurrency,
  type AccountRow,
  type AdditionalCardRow,
  type CategoryRow,
  type HouseholdMemberRow,
  type ProfileRow,
  type TxnRow,
} from "@/lib/finance/types";

type Props = {
  orgId: string;
  currentUserId: string | null;
  transactions: TxnRow[];
  categories: CategoryRow[];
  accounts: AccountRow[];
  additionalCards?: AdditionalCardRow[];
  members: HouseholdMemberRow[];
  profiles: ProfileRow[];
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

const CATEGORY_BORDER_COLORS = CATEGORY_COLORS.map((c) => `${c.replace("bg-", "border-")}/30`);

function colorForCategory(category: CategoryRow | undefined, index: number) {
  if (category?.color) return "";
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function borderForCategory(category: CategoryRow | undefined, index: number) {
  if (category?.color) return "";
  return CATEGORY_BORDER_COLORS[index % CATEGORY_BORDER_COLORS.length];
}

const DESCRIPTION_MAX_CHARS = 44;

function truncateDescription(text: string, max = DESCRIPTION_MAX_CHARS) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** "Gasto de {membro}" quando a transação foi lançada num cartão adicional
 *  atribuído a outra pessoa (spent_by_member_id), senão "Criado por
 *  {membro}" — quem efetivamente digitou o lançamento. */
function attributionInfo(
  transaction: Pick<TxnRow, "created_by" | "spent_by_member_id">,
  currentUserId: string | null,
  profileById: Map<string, ProfileRow>,
  memberById: Map<string, HouseholdMemberRow>,
) {
  const spentBy = transaction.spent_by_member_id;
  if (spentBy && spentBy !== transaction.created_by) {
    return {
      userId: spentBy,
      label: `Gasto de ${
        spentBy === currentUserId
          ? "você"
          : resolveMemberName(memberById.get(spentBy), profileById.get(spentBy), spentBy)
      }`,
    };
  }
  const createdBy = transaction.created_by;
  if (!createdBy) return { userId: null, label: "Sem autor" };
  if (createdBy === currentUserId) return { userId: createdBy, label: "Criado por você" };
  return {
    userId: createdBy,
    label: `Criado por ${resolveMemberName(memberById.get(createdBy), profileById.get(createdBy), createdBy)}`,
  };
}

function memberLabel(
  memberId: string,
  currentUserId: string | null,
  profileById: Map<string, ProfileRow>,
  memberById: Map<string, HouseholdMemberRow>,
) {
  if (memberId === currentUserId) return "Eu";
  return resolveMemberName(memberById.get(memberId), profileById.get(memberId), memberId);
}

export function TransactionList({
  orgId,
  transactions,
  categories,
  accounts,
  additionalCards,
  members,
  profiles,
  currentUserId,
  onCategoryChange,
  onDelete,
}: Props) {
  const confirm = useConfirm();
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const isAdmin = members.find((member) => member.user_id === currentUserId)?.role === "admin";
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedCreator, setSelectedCreator] = useState("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all");
  const [selectedEntrySource, setSelectedEntrySource] = useState("all");
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TxnRow | null>(null);
  const creatorFilterInitialized = useRef(false);
  useEffect(() => {
    if (!creatorFilterInitialized.current && currentUserId) {
      setSelectedCreator(currentUserId);
      creatorFilterInitialized.current = true;
    }
  }, [currentUserId]);
  const categoryItems = leafCategoryOptions(categories);
  const accountOptions = Array.from(
    new Map(
      transactions
        .filter((t) => t.account_id)
        .map((t) => [
          `${t.account_id}|${t.account_kind}`,
          { accountId: t.account_id, accountKind: String(t.account_kind) },
        ]),
    ).values(),
  );
  const displayed = transactions.filter(
    (transaction) =>
      (selectedAccount === "all" || transaction.account_id === selectedAccount) &&
      (selectedCreator === "all" || transaction.created_by === selectedCreator) &&
      (selectedPaymentMethod === "all" || transaction.payment_method === selectedPaymentMethod) &&
      (selectedEntrySource === "all" || transaction.entry_source === selectedEntrySource),
  );
  const income = displayed.reduce((sum, t) => (t.amount > 0 ? sum + t.amount : sum), 0);
  const expenses = displayed.reduce((sum, t) => (t.amount < 0 ? sum + Math.abs(t.amount) : sum), 0);

  return (
    <TooltipProvider>
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
                    {memberLabel(member.user_id, currentUserId, profileById, memberById)}
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
                {accountOptions.map((account) => (
                  <SelectItem
                    key={`${account.accountId}|${account.accountKind}`}
                    value={account.accountId}
                  >
                    {accountLabel(account.accountId, account.accountKind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as formas</SelectItem>
                {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((method) => (
                  <SelectItem key={method} value={method}>
                    {paymentMethodLabel[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedEntrySource} onValueChange={setSelectedEntrySource}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {(Object.keys(entrySourceLabel) as EntrySource[]).map((source) => (
                  <SelectItem key={source} value={source}>
                    {entrySourceLabel[source]}
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
              const canManage = transaction.created_by
                ? transaction.created_by === currentUserId
                : isAdmin;
              const attribution = attributionInfo(
                transaction,
                currentUserId,
                profileById,
                memberById,
              );
              const isIncome = transaction.amount >= 0;
              const TypeIcon = isIncome ? ArrowUpCircle : ArrowDownCircle;
              const CategoryIcon = categoryIconFor(category?.icon, category?.type ?? "expense");
              const AccountKindIcon = accountKindIcon(String(transaction.account_kind));
              const PaymentMethodIcon = paymentMethodIcon(transaction.payment_method);
              const EntrySourceIcon = entrySourceIcon(transaction.entry_source);
              const categoryPillStyle = category?.color
                ? { backgroundColor: `${category.color}1a`, color: category.color }
                : undefined;
              const categoryPillClass = category?.color
                ? "border border-transparent"
                : `${colorForCategory(category, categoryIndex)} border border-transparent text-white`;
              const leftBorderStyle = category?.color
                ? { borderLeftColor: `${category.color}59` }
                : undefined;
              const leftBorderClass = borderForCategory(category, categoryIndex);
              return (
                <div
                  key={transaction.id}
                  className={`overflow-hidden rounded-2xl border border-l-4 border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.08)] ${leftBorderClass}`}
                  style={leftBorderStyle}
                >
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isIncome ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        <TypeIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 min-w-0 font-medium">
                            {truncateDescription(transaction.description || "-")}
                          </p>
                          <strong
                            className={`shrink-0 text-right text-lg font-bold tabular-nums ${
                              isIncome ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </strong>
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                          {new Date(transaction.posted_at).toLocaleDateString("pt-BR")} ·{" "}
                          <AccountKindIcon className="h-3 w-3" />
                          {accountKindLabel[String(transaction.account_kind)] ??
                            transaction.account_kind}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <div
                        className={`flex min-w-0 items-center ${INDICATOR_GAP_CLASS} text-xs text-muted-foreground`}
                      >
                        <div className={`flex items-center ${INDICATOR_GAP_CLASS}`}>
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              aria-label={
                                paymentMethodLabel[transaction.payment_method as PaymentMethod] ??
                                transaction.payment_method
                              }
                              className="text-slate-500"
                            >
                              <PaymentMethodIcon className={INDICATOR_ICON_SIZE_CLASS} />
                            </TooltipTrigger>
                            <TooltipContent>
                              {paymentMethodLabel[transaction.payment_method as PaymentMethod] ??
                                transaction.payment_method}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              aria-label={
                                entrySourceLabel[transaction.entry_source as EntrySource] ??
                                transaction.entry_source
                              }
                              className="text-slate-500"
                            >
                              <EntrySourceIcon className={INDICATOR_ICON_SIZE_CLASS} />
                            </TooltipTrigger>
                            <TooltipContent>
                              {entrySourceLabel[transaction.entry_source as EntrySource] ??
                                transaction.entry_source}
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              aria-label={isIncome ? "Entrada" : "Saída"}
                              className={isIncome ? "text-emerald-600" : "text-red-600"}
                            >
                              <TypeIcon className={INDICATOR_ICON_SIZE_CLASS} />
                            </TooltipTrigger>
                            <TooltipContent>{isIncome ? "Entrada" : "Saída"}</TooltipContent>
                          </Tooltip>
                        </div>
                        {attribution.userId ? (
                          <MemberAvatar
                            name={resolveMemberName(
                              memberById.get(attribution.userId),
                              profileById.get(attribution.userId),
                              attribution.userId,
                            )}
                            color={resolveMemberColor(
                              attribution.userId,
                              memberById.get(attribution.userId)?.color ?? null,
                            )}
                          />
                        ) : null}
                        <p className="truncate">
                          {attribution.label}
                          {consolidated ? " · período fechado" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={consolidated || !canManage}
                                aria-label="Editar lançamento"
                                onClick={() => setEditingTransaction(transaction)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!canManage ? (
                            <TooltipContent>
                              Você só pode editar seus próprios lançamentos.
                            </TooltipContent>
                          ) : null}
                        </Tooltip>
                        {onDelete ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-600 hover:text-red-700"
                                  disabled={consolidated || !canManage}
                                  aria-label="Excluir lançamento"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Excluir lançamento",
                                      description: "Excluir este lançamento?",
                                      confirmLabel: "Excluir",
                                      destructive: true,
                                    });
                                    if (ok) onDelete(transaction);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!canManage ? (
                              <TooltipContent>
                                Você só pode excluir seus próprios lançamentos.
                              </TooltipContent>
                            ) : null}
                          </Tooltip>
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
      {editingTransaction ? (
        <TransactionEditDialog
          transaction={editingTransaction}
          orgId={orgId}
          userId={currentUserId}
          categories={categories}
          accounts={accounts}
          additionalCards={additionalCards}
          members={members}
          profiles={profiles}
          onClose={() => setEditingTransaction(null)}
        />
      ) : null}
    </TooltipProvider>
  );
}
