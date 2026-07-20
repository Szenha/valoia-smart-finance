import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  CheckCircle2,
  LayoutGrid,
  Layers,
  List,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
import { CollapsibleFilters } from "@/components/finance/CollapsibleFilters";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { StatTile } from "@/components/finance/StatTile";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoryPath, leafCategoryOptions } from "@/lib/finance/categories";
import { categoryIconFor } from "@/lib/finance/category-icons";
import { formatDateBR } from "@/lib/finance/date-utils";
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
  /** A tela pai (Transações) recolhe o bloco do microfone junto com os
   *  filtros — repassa o estado de colapso para fora. */
  onFiltersCollapsedChange?: (collapsed: boolean) => void;
};

type ViewMode = "cards" | "list";
const VIEW_MODE_KEY = "calcum:transactions-view";

// Paleta suave (fundo -50, texto -700) — mesmo padrão de badge usado no
// resto do app (metas, contas fixas, dashboard), em vez do preenchimento
// sólido -500 com texto branco que ficava chapado ao lado das outras
// etiquetas discretas da tela.
const CATEGORY_THEMES = [
  { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200" },
  { bg: "bg-lime-50", text: "text-lime-700", border: "border-lime-200" },
  { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
];
// border-l-* (não border-*) — só a lateral esquerda deve ganhar a cor da
// categoria; as outras três bordas ficam no cinza neutro padrão.
const CATEGORY_LEFT_BORDER_COLORS = [
  "border-l-emerald-300",
  "border-l-sky-300",
  "border-l-amber-300",
  "border-l-rose-300",
  "border-l-violet-300",
  "border-l-cyan-300",
  "border-l-lime-300",
  "border-l-orange-300",
];

function themeForCategory(index: number) {
  return CATEGORY_THEMES[index % CATEGORY_THEMES.length];
}

function borderForCategory(category: CategoryRow | undefined, index: number) {
  if (category?.color) return "";
  return CATEGORY_LEFT_BORDER_COLORS[index % CATEGORY_LEFT_BORDER_COLORS.length];
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
  onFiltersCollapsedChange,
}: Props) {
  const confirm = useConfirm();
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const isAdmin = members.find((member) => member.user_id === currentUserId)?.role === "admin";
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedCreator, setSelectedCreator] = useState("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all");
  const [selectedEntrySource, setSelectedEntrySource] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TxnRow | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "cards" || stored === "list") setViewMode(stored);
  }, []);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  }

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
      (selectedEntrySource === "all" || transaction.entry_source === selectedEntrySource) &&
      (selectedCategory === "all" || transaction.category_id === selectedCategory),
  );
  // Transferência é um par débito/crédito entre contas, não receita/despesa
  // de verdade — excluída do resumo pra não inflar "Entradas"/"Saídas".
  const income = displayed.reduce(
    (sum, t) => (t.type !== "MANUAL_TRANSFER" && t.amount > 0 ? sum + t.amount : sum),
    0,
  );
  const expenses = displayed.reduce(
    (sum, t) => (t.type !== "MANUAL_TRANSFER" && t.amount < 0 ? sum + Math.abs(t.amount) : sum),
    0,
  );

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="shrink-0">Transações</CardTitle>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              value={viewMode}
              onValueChange={(value) => value && changeViewMode(value as ViewMode)}
            >
              <ToggleGroupItem value="list" aria-label="Ver como lista">
                <List className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="cards" aria-label="Ver como cards">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
            <CollapsibleFilters
              storageKey="calcum:transactions-filters-collapsed"
              onCollapsedChange={onFiltersCollapsedChange}
            >
              <Select value={selectedCreator} onValueChange={setSelectedCreator}>
                <SelectTrigger className="w-[150px]">
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
                <SelectTrigger className="w-[170px]">
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
                <SelectTrigger className="w-[150px]">
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
                <SelectTrigger className="w-[150px]">
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
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categoryItems.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CollapsibleFilters>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-3 border-b pb-4 lg:grid-cols-4">
            <StatTile label="Lançamentos" value={String(displayed.length)} theme="blue" compact />
            <StatTile label="Entradas" value={formatCurrency(income)} theme="green" compact />
            <StatTile label="Saídas" value={formatCurrency(expenses)} theme="coral" compact />
            <StatTile
              label="Saldo"
              value={formatCurrency(income - expenses)}
              theme="amber"
              compact
            />
          </div>
          <div
            className={
              viewMode === "cards"
                ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3"
                : "flex flex-col gap-2"
            }
          >
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
              const isTransfer = transaction.type === "MANUAL_TRANSFER";
              const isIncome = transaction.amount >= 0;
              const TypeIcon = isTransfer
                ? ArrowLeftRight
                : isIncome
                  ? ArrowUpCircle
                  : ArrowDownCircle;
              const CategoryIcon = categoryIconFor(category?.icon, category?.type ?? "expense");
              const AccountKindIcon = accountKindIcon(String(transaction.account_kind));
              const PaymentMethodIcon = paymentMethodIcon(transaction.payment_method);
              const EntrySourceIcon = entrySourceIcon(transaction.entry_source);
              const categoryTheme = themeForCategory(categoryIndex);
              const categoryPillStyle = category?.color
                ? { backgroundColor: `${category.color}1a`, color: category.color }
                : undefined;
              const categoryPillClass = category?.color
                ? "border border-transparent"
                : `${categoryTheme.bg} ${categoryTheme.text} border ${categoryTheme.border}`;
              const leftBorderStyle = category?.color
                ? { borderLeftColor: `${category.color}59` }
                : undefined;
              const leftBorderClass = borderForCategory(category, categoryIndex);
              const amountColorClass = isTransfer
                ? "text-slate-600"
                : isIncome
                  ? "text-emerald-700"
                  : "text-rose-700";
              const typeIconWrapperClass = isTransfer
                ? "bg-slate-100 text-slate-600"
                : isIncome
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600";
              const typeIndicatorClass = isTransfer
                ? "text-slate-500"
                : isIncome
                  ? "text-emerald-600"
                  : "text-red-600";
              const typeLabel = isTransfer ? "Transferência" : isIncome ? "Entrada" : "Saída";
              const amountClass = `text-right text-base font-semibold tabular-nums ${amountColorClass}`;
              const listAmountClass = `text-right text-sm font-semibold tabular-nums ${amountColorClass}`;

              const categoryBadge = isEditing ? (
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
                  title={categoryPath(categories, transaction.category_id)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${categoryPillClass}`}
                  style={categoryPillStyle}
                >
                  <CategoryIcon className="h-3 w-3" />
                  {category?.name ?? "Sem categoria"}
                </button>
              );

              const statusBadges = (
                <>
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
                </>
              );

              const indicators = (
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
                      aria-label={typeLabel}
                      className={typeIndicatorClass}
                    >
                      <TypeIcon className={INDICATOR_ICON_SIZE_CLASS} />
                    </TooltipTrigger>
                    <TooltipContent>{typeLabel}</TooltipContent>
                  </Tooltip>
                </div>
              );

              const actionButtons = (
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
              );

              if (viewMode === "list") {
                const listCategoryControl = isEditing ? (
                  <Select
                    defaultValue={transaction.category_id ?? "none"}
                    onValueChange={(value) => {
                      setEditingCategoryFor(null);
                      if (value !== "none") onCategoryChange(transaction, value);
                    }}
                  >
                    <SelectTrigger className="h-6 w-[160px] text-xs">
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
                    title={categoryPath(categories, transaction.category_id)}
                    className="flex min-w-0 items-center gap-1 truncate hover:underline"
                  >
                    <CategoryIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{category?.name ?? "Sem categoria"}</span>
                  </button>
                );
                return (
                  <div
                    key={transaction.id}
                    className={`flex items-center gap-2.5 overflow-hidden rounded-lg border border-l-4 border-slate-200 bg-white px-3 py-2 ${leftBorderClass}`}
                    style={leftBorderStyle}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        typeIconWrapperClass
                      }`}
                    >
                      <TypeIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {transaction.description || "-"}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDateBR(transaction.posted_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {listCategoryControl}
                        {transaction.needs_review ? (
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              aria-label="Revisar"
                              className="text-amber-600"
                            >
                              <AlertCircle className="h-3 w-3" />
                            </TooltipTrigger>
                            <TooltipContent>Pendente de revisão</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {transaction.installment_plan_id ? (
                          <Tooltip>
                            <TooltipTrigger type="button" aria-label="Parcelado">
                              <Layers className="h-3 w-3" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {transaction.installment_number
                                ? `${transaction.installment_number} parcela`
                                : "Parcelado"}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                        {consolidated ? (
                          <Tooltip>
                            <TooltipTrigger type="button" aria-label="Consolidado">
                              <Lock className="h-3 w-3" />
                            </TooltipTrigger>
                            <TooltipContent>Consolidado · período fechado</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                    <strong className={`shrink-0 ${listAmountClass}`}>
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </strong>
                    <div className="flex shrink-0 items-center">{actionButtons}</div>
                  </div>
                );
              }

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
                          <strong className={`shrink-0 ${amountClass}`}>
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </strong>
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                          {formatDateBR(transaction.posted_at)} ·{" "}
                          <AccountKindIcon className="h-3 w-3" />
                          {accountKindLabel[String(transaction.account_kind)] ??
                            transaction.account_kind}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {categoryBadge}
                      {statusBadges}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <div
                        className={`flex min-w-0 items-center ${INDICATOR_GAP_CLASS} text-xs text-muted-foreground`}
                      >
                        {indicators}
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
                      {actionButtons}
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
          transactions={transactions}
          onClose={() => setEditingTransaction(null)}
        />
      ) : null}
    </TooltipProvider>
  );
}
