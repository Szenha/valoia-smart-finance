import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { CadastrosTabs } from "@/components/finance/CadastrosTabs";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { resolveMemberColor, resolveMemberName } from "@/lib/finance/member-visuals";
import {
  accountKindIcon,
  accountKindLabel,
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
};

function ContasECartoesRoute() {
  const queryClient = useQueryClient();
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const saveAccount = useMutation({
    mutationFn: async () => {
      if (!orgId || !ownerUserId) return;
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
        },
        { onConflict: "organization_id,account_key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
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
      if (!window.confirm(`Excluir "${account.name}" definitivamente?`)) return;
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

  return (
    <AppShell
      activeSection="cadastros"
      title="Contas e cartões"
      subtitle="Contas e cartões usados nos lançamentos"
    >
      <CadastrosTabs value="contas" />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{editingId ? "Editar conta ou cartão" : "Nova conta ou cartão"}</CardTitle>
          {editingId ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancelar edição
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
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
              <Select value={kind} onValueChange={(value) => setKind(value as AccountKind)}>
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
            <Button
              className="md:col-span-2"
              onClick={() => saveAccount.mutate()}
              disabled={!accountName || !accountKey || !ownerUserId || saveAccount.isPending}
            >
              {editingId ? "Salvar alterações" : "Salvar conta"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {checkingBalances.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Saldo consolidado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-700">
            {formatCurrency(consolidatedBalance)}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Contas e cartões cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {deleteError ? <p className="mb-3 text-sm text-red-600">{deleteError}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {(accountsQuery.data ?? []).map((account) => {
              const KindIcon = accountKindIcon(account.kind);
              const balance = balanceByAccountId.get(account.id);
              const cardSummary = cardSummaryByAccountId.get(account.id);
              const ownerLabel =
                account.owner_user_id === currentUserId
                  ? "Eu"
                  : memberDisplayName(
                      profileById.get(account.owner_user_id),
                      account.owner_user_id,
                    );
              const actions = (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Editar"
                    onClick={() => startEdit(account)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => archiveAccount(account.id, account.archived)}
                  >
                    {account.archived ? "Reativar" : "Arquivar"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                    aria-label="Excluir"
                    onClick={() => removeAccount(account)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );

              if (account.kind === "credit_card") {
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
                        : "bg-emerald-600";
                return (
                  <div
                    key={account.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                          <KindIcon className="h-4 w-4" />
                        </span>
                        <div>
                          <strong>{account.name}</strong>
                          <p className="text-muted-foreground">
                            {account.institution ?? "Sem instituição"} · Titular: {ownerLabel}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Limite utilizado</span>
                        <span>{pct !== null ? `${pct.toFixed(0)}%` : "sem limite definido"}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${barColor}`}
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Usado</p>
                        <strong className="text-sm">{formatCurrency(used)}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Disponível</p>
                        <strong className="text-sm text-emerald-700">
                          {formatCurrency(cardSummary?.limit_available ?? limit ?? 0)}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                        <strong className="text-sm">
                          {limit != null ? formatCurrency(limit) : "—"}
                        </strong>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        Fecha dia {account.closing_day ?? "—"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        Vence dia {account.due_day ?? "—"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        Fatura atual {formatCurrency(cardSummary?.current_invoice_total ?? 0)}
                      </span>
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-500">
                          Cartões adicionais · mesmo limite
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setAddingHolderFor(account);
                            setHolderMemberId("");
                            setHolderLabel("");
                          }}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Adicionar
                        </Button>
                      </div>
                      {(additionalCardsByAccountId.get(account.id) ?? []).length > 0 ? (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {(additionalCardsByAccountId.get(account.id) ?? []).map((holder) => {
                            const holderName = resolveMemberName(
                              memberById.get(holder.member_user_id),
                              profileById.get(holder.member_user_id),
                              holder.member_user_id,
                            );
                            return (
                              <div
                                key={holder.id}
                                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
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
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Nenhum cartão adicional vinculado.
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(cardSummary?.future_installments_total ?? 0)} em parcelas
                        futuras
                      </p>
                      {actions}
                    </div>
                  </div>
                );
              }

              if (account.kind === "checking") {
                return (
                  <div
                    key={account.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <KindIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <strong>{account.name}</strong>
                        <p className="text-muted-foreground">
                          {account.institution ?? "Sem instituição"} · Titular: {ownerLabel}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg bg-slate-50 p-3">
                      {balance && account.initial_balance_date ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Saldo atual</p>
                            <strong
                              className={`text-xl ${balance.current_balance < 0 ? "text-red-700" : "text-emerald-700"}`}
                            >
                              {formatCurrency(balance.current_balance)}
                            </strong>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-700"
                            aria-label="Atualizar saldo"
                            onClick={refreshBalances}
                          >
                            <RefreshCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Defina o saldo inicial e a data de referência para calcular o saldo atual.
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-3">
                      {actions}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={account.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <KindIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <strong>{account.name}</strong>
                        <p className="text-muted-foreground">
                          {account.institution ?? "Sem instituição"} ·{" "}
                          {accountKindLabel[account.kind]} · Titular: {ownerLabel}
                        </p>
                      </div>
                    </div>
                    {actions}
                  </div>
                  {account.kind === "investment" && account.initial_balance != null ? (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">
                        Saldo registrado{" "}
                        {account.initial_balance_date
                          ? `em ${new Date(account.initial_balance_date).toLocaleDateString("pt-BR")}`
                          : ""}
                      </p>
                      <strong className="text-lg text-emerald-700">
                        {formatCurrency(account.initial_balance)}
                      </strong>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
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
    </AppShell>
  );
}
