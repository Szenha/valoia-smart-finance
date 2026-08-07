import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AccountStatementDialog } from "@/components/finance/AccountStatementDialog";
import { AppShell } from "@/components/finance/AppShell";
import { CadastrosTabs } from "@/components/finance/CadastrosTabs";
import { CardStatementDialog } from "@/components/finance/CardStatementDialog";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { StatTile } from "@/components/finance/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  addAdditionalCard,
  countAccountTransactions,
  deleteAccount,
  fetchAccountBalances,
  fetchAccounts,
  fetchAdditionalCards,
  fetchCardSummary,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  removeAdditionalCard,
} from "@/lib/finance/data";
import { formatDateBR } from "@/lib/finance/date-utils";
import { resolveMemberColor, resolveMemberName } from "@/lib/finance/member-visuals";
import {
  accountKindIcon,
  formatCurrency,
  memberDisplayName,
  type AccountKind,
  type AccountRow,
  type AdditionalCardRow,
} from "@/lib/finance/types";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/cadastros/contas-e-cartoes")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Contas e cartões" }] }),
  component: ContasECartoesRoute,
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  accountName: "",
  accountKey: "",
  institution: "",
  kind: "checking" as AccountKind,
  initialBalance: "",
  initialBalanceDate: today(),
  closingDay: "",
  dueDay: "",
  creditLimit: "",
  ownerUserId: "",
  isPrimary: false,
};

function ContasECartoesRoute() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const { orgId } = useActiveOrganization(currentUserId);

  const accountsQuery = useQuery({
    queryKey: ["accounts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccounts(orgId!),
  });
  const membersQuery = useQuery({
    queryKey: ["household-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchHouseholdMembers(orgId!),
  });
  const memberIds = (membersQuery.data ?? []).map((member) => member.user_id);
  const profilesQuery = useQuery({
    queryKey: ["member-profiles", orgId, memberIds],
    enabled: !!orgId && memberIds.length > 0,
    queryFn: () => fetchMemberProfiles(memberIds),
  });
  const balancesQuery = useQuery({
    queryKey: ["account-balances", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccountBalances(orgId!),
  });
  const cardSummaryQuery = useQuery({
    queryKey: ["card-summary", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCardSummary(orgId!),
  });
  const additionalCardsQuery = useQuery({
    queryKey: ["additional-cards", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAdditionalCards(orgId!),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState(EMPTY_FORM.accountName);
  const [accountKey, setAccountKey] = useState(EMPTY_FORM.accountKey);
  const [institution, setInstitution] = useState(EMPTY_FORM.institution);
  const [kind, setKind] = useState<AccountKind>(EMPTY_FORM.kind);
  const [initialBalance, setInitialBalance] = useState(EMPTY_FORM.initialBalance);
  const [initialBalanceDate, setInitialBalanceDate] = useState(EMPTY_FORM.initialBalanceDate);
  const [closingDay, setClosingDay] = useState(EMPTY_FORM.closingDay);
  const [dueDay, setDueDay] = useState(EMPTY_FORM.dueDay);
  const [creditLimit, setCreditLimit] = useState(EMPTY_FORM.creditLimit);
  const [ownerUserId, setOwnerUserId] = useState(EMPTY_FORM.ownerUserId);
  const [isPrimary, setIsPrimary] = useState(EMPTY_FORM.isPrimary);

  useEffect(() => {
    if (!editingId && currentUserId && !ownerUserId) setOwnerUserId(currentUserId);
  }, [editingId, currentUserId, ownerUserId]);

  function resetForm() {
    setEditingId(null);
    setAccountName(EMPTY_FORM.accountName);
    setAccountKey(EMPTY_FORM.accountKey);
    setInstitution(EMPTY_FORM.institution);
    setKind(EMPTY_FORM.kind);
    setInitialBalance(EMPTY_FORM.initialBalance);
    setInitialBalanceDate(EMPTY_FORM.initialBalanceDate);
    setClosingDay(EMPTY_FORM.closingDay);
    setDueDay(EMPTY_FORM.dueDay);
    setCreditLimit(EMPTY_FORM.creditLimit);
    setOwnerUserId(currentUserId ?? EMPTY_FORM.ownerUserId);
    setIsPrimary(EMPTY_FORM.isPrimary);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function startEdit(account: AccountRow) {
    setEditingId(account.id);
    setAccountName(account.name);
    setAccountKey(account.account_key);
    setInstitution(account.institution ?? "");
    setKind(account.kind);
    setInitialBalance(account.initial_balance != null ? String(account.initial_balance) : "");
    setInitialBalanceDate(account.initial_balance_date ?? today());
    setClosingDay(account.closing_day != null ? String(account.closing_day) : "");
    setDueDay(account.due_day != null ? String(account.due_day) : "");
    setCreditLimit(account.credit_limit != null ? String(account.credit_limit) : "");
    setOwnerUserId(account.owner_user_id);
    setIsPrimary(account.is_primary);
    setFormOpen(true);
  }

  // Se essa for a única conta desse titular+tipo, ela é sempre a principal —
  // sem isso, a primeira conta de alguém nunca fica marcada, e a ambiguidade
  // já aparece assim que uma segunda é cadastrada.
  const soleAccountOfKind =
    kind !== "investment" &&
    !!ownerUserId &&
    (accountsQuery.data ?? []).filter(
      (a) => a.owner_user_id === ownerUserId && a.kind === kind && a.id !== editingId,
    ).length === 0;
  const effectiveIsPrimary = soleAccountOfKind || isPrimary;
  const currentPrimaryOfKind = (accountsQuery.data ?? []).find(
    (a) => a.owner_user_id === ownerUserId && a.kind === kind && a.is_primary && a.id !== editingId,
  );

  const saveAccount = useMutation({
    mutationFn: async () => {
      if (!orgId || !ownerUserId) return;
      // Só uma conta principal por titular+tipo — marcar esta desmarca as
      // demais do mesmo titular/tipo antes de gravar (o índice único no
      // banco também garante isso, mas fazemos aqui pra não colidir com ele).
      if (effectiveIsPrimary) {
        const { error: unsetError } = await supabase
          .from("financial_accounts")
          .update({ is_primary: false })
          .eq("organization_id", orgId)
          .eq("owner_user_id", ownerUserId)
          .eq("kind", kind)
          .neq("account_key", accountKey);
        if (unsetError) throw new Error(unsetError.message);
      }
      const { error } = await supabase.from("financial_accounts").upsert(
        {
          organization_id: orgId,
          account_key: accountKey,
          name: accountName,
          institution: institution || null,
          kind,
          initial_balance: kind !== "credit_card" && initialBalance ? Number(initialBalance) : null,
          initial_balance_date:
            kind !== "credit_card" && initialBalance ? initialBalanceDate : null,
          closing_day: kind === "credit_card" && closingDay ? Number(closingDay) : null,
          due_day: kind === "credit_card" && dueDay ? Number(dueDay) : null,
          credit_limit: kind === "credit_card" && creditLimit ? Number(creditLimit) : null,
          owner_user_id: ownerUserId,
          is_primary: effectiveIsPrimary,
        },
        { onConflict: "organization_id,account_key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setFormOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["accounts", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["account-balances", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["card-summary", orgId] });
    },
  });

  async function archiveAccount(id: string, archived: boolean) {
    await supabase.from("financial_accounts").update({ archived: !archived }).eq("id", id);
    await queryClient.invalidateQueries({ queryKey: ["accounts", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["account-balances", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["card-summary", orgId] });
  }

  const [deleteError, setDeleteError] = useState("");

  async function removeAccount(account: AccountRow) {
    if (!orgId) return;
    setDeleteError("");
    try {
      const linkedCount = await countAccountTransactions(orgId, account.account_key);
      if (linkedCount > 0) {
        setDeleteError(
          `"${account.name}" tem ${linkedCount} transação(ões) vinculada(s) e não pode ser excluída. Arquive-a em vez disso.`,
        );
        return;
      }
      const ok = await confirm({
        title: "Excluir conta",
        description: `Excluir "${account.name}" definitivamente?`,
        confirmLabel: "Excluir",
        destructive: true,
      });
      if (!ok) return;
      await deleteAccount(orgId, account.id);
      await queryClient.invalidateQueries({ queryKey: ["accounts", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["account-balances", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["card-summary", orgId] });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshBalances() {
    await queryClient.invalidateQueries({ queryKey: ["account-balances", orgId] });
    await queryClient.invalidateQueries({ queryKey: ["card-summary", orgId] });
  }

  const [statementAccount, setStatementAccount] = useState<AccountRow | null>(null);

  const [addingHolderFor, setAddingHolderFor] = useState<AccountRow | null>(null);
  const [holderMemberId, setHolderMemberId] = useState("");
  const [holderLabel, setHolderLabel] = useState("");

  const addHolder = useMutation({
    mutationFn: async () => {
      if (!orgId || !addingHolderFor || !holderMemberId) return;
      await addAdditionalCard(orgId, addingHolderFor.id, holderMemberId, holderLabel || null);
    },
    onSuccess: async () => {
      setAddingHolderFor(null);
      setHolderMemberId("");
      setHolderLabel("");
      await queryClient.invalidateQueries({ queryKey: ["additional-cards", orgId] });
    },
  });

  const removeHolder = useMutation({
    mutationFn: async (holderId: string) => {
      if (!orgId) return;
      await removeAdditionalCard(orgId, holderId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["additional-cards", orgId] });
    },
  });

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  const balanceByAccountId = new Map(
    (balancesQuery.data ?? []).map((row) => [row.account_id, row]),
  );
  const cardSummaryByAccountId = new Map(
    (cardSummaryQuery.data ?? []).map((row) => [row.account_id, row]),
  );
  const checkingBalances = balancesQuery.data ?? [];
  const consolidatedBalance = checkingBalances.reduce((sum, row) => sum + row.current_balance, 0);
  const profileById = new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile]));
  const members = membersQuery.data ?? [];
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const additionalCardsByAccountId = new Map<string, AdditionalCardRow[]>();
  for (const holder of additionalCardsQuery.data ?? []) {
    const list = additionalCardsByAccountId.get(holder.financial_account_id) ?? [];
    list.push(holder);
    additionalCardsByAccountId.set(holder.financial_account_id, list);
  }
  const accounts = accountsQuery.data ?? [];
  // Seções separadas (não uma grade só) porque cartão de crédito tem bem
  // mais conteúdo que conta corrente — misturados na mesma grid, o CSS grid
  // estica as contas correntes pra bater a altura do cartão na mesma linha,
  // deixando o card de conta corrente enorme e vazio por baixo.
  const bankAccounts = accounts.filter((a) => a.kind !== "credit_card");
  const creditCardAccounts = accounts.filter((a) => a.kind === "credit_card");

  function accountActionsMenu(account: AccountRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
            aria-label="Mais ações"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {account.kind !== "investment" ? (
            <DropdownMenuItem onSelect={() => setStatementAccount(account)}>
              <FileText className="mr-2 h-3.5 w-3.5" />
              Ver extrato
            </DropdownMenuItem>
          ) : null}
          {account.kind === "checking" ? (
            <DropdownMenuItem onSelect={refreshBalances}>
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              Atualizar saldo
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => startEdit(account)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => archiveAccount(account.id, account.archived)}>
            <Archive className="mr-2 h-3.5 w-3.5" />
            {account.archived ? "Reativar" : "Arquivar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => removeAccount(account)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <AppShell
      activeSection="cadastros"
      title="Contas e cartões"
      subtitle="Contas e cartões usados nos lançamentos"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CadastrosTabs value="contas" />
        <div className="flex items-center gap-3">
          {checkingBalances.length > 1 ? (
            <StatTile
              label="Saldo consolidado"
              value={formatCurrency(consolidatedBalance)}
              tone={consolidatedBalance < 0 ? "expense" : "income"}
              icon={Wallet}
              compact
            />
          ) : null}
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar conta ou cartão" : "Nova conta ou cartão"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Nome</Label>
              <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
            </div>
            <div>
              <Label>Chave da conta</Label>
              <Input
                value={accountKey}
                disabled={!!editingId}
                onChange={(event) => setAccountKey(event.target.value)}
              />
            </div>
            <div>
              <Label>Instituição</Label>
              <Input value={institution} onChange={(event) => setInstitution(event.target.value)} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as AccountKind);
                  if (value === "investment") setIsPrimary(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Conta corrente</SelectItem>
                  <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                  <SelectItem value="investment">Investimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Titular</Label>
              <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o titular" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.user_id === currentUserId
                        ? "Eu"
                        : memberDisplayName(profileById.get(member.user_id), member.user_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {kind !== "investment" ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 md:col-span-2">
                <div>
                  <Label className="mb-0.5 block">Conta principal</Label>
                  <p className="text-xs text-muted-foreground">
                    {soleAccountOfKind
                      ? "Única conta desse tipo para esse titular — sempre principal."
                      : "Usada automaticamente quando um lançamento por voz não conseguir identificar sozinho qual conta desse titular usar (ex: mais de uma conta corrente)."}
                  </p>
                </div>
                <Switch
                  checked={effectiveIsPrimary}
                  disabled={soleAccountOfKind}
                  onCheckedChange={async (checked) => {
                    if (checked && currentPrimaryOfKind) {
                      const ok = await confirm({
                        title: "Trocar conta principal",
                        description: `Definir "${accountName || "esta conta"}" como principal vai desmarcar "${currentPrimaryOfKind.name}", que é a principal atual. Continuar?`,
                        confirmLabel: "Definir como principal",
                      });
                      if (!ok) return;
                    }
                    setIsPrimary(checked);
                  }}
                />
              </div>
            ) : null}
            {kind === "checking" || kind === "investment" ? (
              <>
                <div>
                  <Label>Saldo inicial</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={initialBalance}
                    onChange={(event) => setInitialBalance(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Data de referência do saldo</Label>
                  <Input
                    type="date"
                    value={initialBalanceDate}
                    onChange={(event) => setInitialBalanceDate(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            {kind === "credit_card" ? (
              <>
                <div>
                  <Label>Dia de fechamento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    placeholder="Ex: 25"
                    value={closingDay}
                    onChange={(event) => setClosingDay(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Dia de vencimento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    placeholder="Ex: 5"
                    value={dueDay}
                    onChange={(event) => setDueDay(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Limite do cartão</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={creditLimit}
                    onChange={(event) => setCreditLimit(event.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveAccount.mutate()}
              disabled={!accountName || !accountKey || !ownerUserId || saveAccount.isPending}
            >
              {editingId ? "Salvar alterações" : "Salvar conta"}
            </Button>
          </DialogFooter>
          {saveAccount.error ? (
            <p className="text-sm text-red-700">
              {saveAccount.error instanceof Error
                ? saveAccount.error.message
                : String(saveAccount.error)}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      {deleteError ? <p className="text-sm text-red-600">{deleteError}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Contas</CardTitle>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma conta corrente ou de investimento cadastrada ainda.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {bankAccounts.map((account) => {
                const KindIcon = accountKindIcon(account.kind);
                const balance = balanceByAccountId.get(account.id);
                const ownerLabel =
                  account.owner_user_id === currentUserId
                    ? "Eu"
                    : memberDisplayName(
                        profileById.get(account.owner_user_id),
                        account.owner_user_id,
                      );

                const header = (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <KindIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <strong className="truncate text-sm">{account.name}</strong>
                          {account.is_primary ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                            >
                              Principal
                            </Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {account.institution ?? "Sem instituição"} · {ownerLabel}
                        </p>
                      </div>
                    </div>
                    {accountActionsMenu(account)}
                  </div>
                );

                if (account.kind === "checking") {
                  return (
                    <div
                      key={account.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      {header}
                      <div className="mt-4">
                        {balance && account.initial_balance_date ? (
                          <>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Saldo atual
                            </p>
                            <strong
                              className={`text-lg font-semibold tabular-nums ${
                                balance.current_balance < 0 ? "text-red-700" : "text-slate-950"
                              }`}
                            >
                              {formatCurrency(balance.current_balance)}
                            </strong>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Defina o saldo inicial e a data de referência para calcular o saldo
                            atual.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={account.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    {header}
                    {account.initial_balance != null ? (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Saldo registrado
                          {account.initial_balance_date
                            ? ` · ${formatDateBR(account.initial_balance_date)}`
                            : ""}
                        </p>
                        <strong className="text-lg font-semibold tabular-nums">
                          {formatCurrency(account.initial_balance)}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cartões de crédito</CardTitle>
        </CardHeader>
        <CardContent>
          {creditCardAccounts.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhum cartão de crédito cadastrado ainda.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {creditCardAccounts.map((account) => {
                const KindIcon = accountKindIcon(account.kind);
                const cardSummary = cardSummaryByAccountId.get(account.id);
                const ownerLabel =
                  account.owner_user_id === currentUserId
                    ? "Eu"
                    : memberDisplayName(
                        profileById.get(account.owner_user_id),
                        account.owner_user_id,
                      );
                const used = cardSummary?.limit_used ?? 0;
                const limit = account.credit_limit;
                const pct = limit && limit > 0 ? Math.min((used / limit) * 100, 100) : null;
                const barColor =
                  pct === null
                    ? "bg-slate-300"
                    : pct >= 90
                      ? "bg-red-500"
                      : pct >= 70
                        ? "bg-amber-500"
                        : "bg-violet-600";
                const futureInstallments = cardSummary?.future_installments_total ?? 0;
                const holders = additionalCardsByAccountId.get(account.id) ?? [];
                return (
                  <div
                    key={account.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                          <KindIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <strong className="truncate text-sm">{account.name}</strong>
                          <p className="truncate text-xs text-muted-foreground">
                            {account.institution ?? "Sem instituição"} · {ownerLabel}
                          </p>
                        </div>
                      </div>
                      {accountActionsMenu(account)}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Fatura atual
                        </p>
                        <strong className="text-lg font-semibold tabular-nums">
                          {formatCurrency(cardSummary?.current_invoice_total ?? 0)}
                        </strong>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Parcelas futuras
                        </p>
                        <strong className="text-lg font-semibold tabular-nums text-slate-600">
                          {formatCurrency(futureInstallments)}
                        </strong>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {pct !== null
                            ? `${pct.toFixed(0)}% do limite usado`
                            : "Sem limite definido"}
                        </span>
                        <span>
                          {formatCurrency(cardSummary?.limit_available ?? limit ?? 0)} disponível
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </div>
                    </div>

                    <p className="mt-2.5 text-xs text-muted-foreground">
                      Fecha dia {account.closing_day ?? "—"} · Vence dia {account.due_day ?? "—"}
                      {limit != null ? ` · Limite ${formatCurrency(limit)}` : ""}
                    </p>

                    <div className="mt-3 border-t border-slate-100 pt-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-500">Cartões adicionais</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-slate-700"
                          aria-label="Adicionar cartão adicional"
                          title="Adicionar cartão adicional"
                          onClick={() => {
                            setAddingHolderFor(account);
                            setHolderMemberId("");
                            setHolderLabel("");
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {holders.length > 0 ? (
                        <div className="mt-1.5 divide-y divide-slate-100">
                          {holders.map((holder) => {
                            const holderName = resolveMemberName(
                              memberById.get(holder.member_user_id),
                              profileById.get(holder.member_user_id),
                              holder.member_user_id,
                            );
                            return (
                              <div
                                key={holder.id}
                                className="flex items-center justify-between gap-2 py-1.5"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <MemberAvatar
                                    name={holderName}
                                    color={resolveMemberColor(
                                      holder.member_user_id,
                                      memberById.get(holder.member_user_id)?.color ?? null,
                                    )}
                                  />
                                  <span className="truncate text-xs text-slate-600">
                                    {holder.label ?? `${account.name} — ${holderName}`}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 text-slate-400 hover:text-red-600"
                                  aria-label="Remover cartão adicional"
                                  onClick={() => removeHolder.mutate(holder.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Nenhum cartão adicional vinculado.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!addingHolderFor} onOpenChange={(open) => !open && setAddingHolderFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cartão adicional</DialogTitle>
          </DialogHeader>
          {addingHolderFor ? (
            <>
              <p className="text-sm text-muted-foreground">
                Vinculado a <strong>{addingHolderFor.name}</strong> — usa o mesmo limite do cartão
                principal.
              </p>
              <div>
                <Label>Membro</Label>
                <Select value={holderMemberId} onValueChange={setHolderMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o membro" />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter(
                        (member) =>
                          member.user_id !== addingHolderFor.owner_user_id &&
                          !(additionalCardsByAccountId.get(addingHolderFor.id) ?? []).some(
                            (holder) => holder.member_user_id === member.user_id,
                          ),
                      )
                      .map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.user_id === currentUserId
                            ? "Eu"
                            : memberDisplayName(profileById.get(member.user_id), member.user_id)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Apelido (opcional)</Label>
                <Input
                  value={holderLabel}
                  onChange={(event) => setHolderLabel(event.target.value)}
                  placeholder={
                    holderMemberId
                      ? `${addingHolderFor.name} — ${
                          holderMemberId === currentUserId
                            ? "Eu"
                            : memberDisplayName(profileById.get(holderMemberId), holderMemberId)
                        }`
                      : `${addingHolderFor.name} — nome do membro`
                  }
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAddingHolderFor(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => addHolder.mutate()}
                  disabled={!holderMemberId || addHolder.isPending}
                >
                  Adicionar cartão adicional
                </Button>
              </DialogFooter>
              {addHolder.error ? (
                <p className="text-sm text-red-700">
                  {addHolder.error instanceof Error
                    ? addHolder.error.message
                    : String(addHolder.error)}
                </p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AccountStatementDialog
        orgId={orgId}
        account={statementAccount?.kind === "checking" ? statementAccount : null}
        onClose={() => setStatementAccount(null)}
      />
      <CardStatementDialog
        orgId={orgId}
        account={statementAccount?.kind === "credit_card" ? statementAccount : null}
        onClose={() => setStatementAccount(null)}
      />
    </AppShell>
  );
}
