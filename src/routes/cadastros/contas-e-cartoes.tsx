import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { CadastrosTabs } from "@/components/finance/CadastrosTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchAccountBalances, fetchAccounts, fetchCardSummary } from "@/lib/finance/data";
import {
  accountKindIcon,
  accountKindLabel,
  formatCurrency,
  type AccountKind,
} from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/cadastros/contas-e-cartoes")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  component: ContasECartoesRoute,
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ContasECartoesRoute() {
  const queryClient = useQueryClient();
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const accountsQuery = useQuery({
    queryKey: ["accounts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccounts(orgId!),
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

  const [accountName, setAccountName] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [initialBalance, setInitialBalance] = useState("");
  const [initialBalanceDate, setInitialBalanceDate] = useState(today());
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [creditLimit, setCreditLimit] = useState("");

  const addAccount = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from("financial_accounts").upsert(
        {
          organization_id: orgId,
          account_key: accountKey,
          name: accountName,
          institution: institution || null,
          kind,
          initial_balance: kind === "checking" && initialBalance ? Number(initialBalance) : null,
          initial_balance_date: kind === "checking" && initialBalance ? initialBalanceDate : null,
          closing_day: kind === "credit_card" && closingDay ? Number(closingDay) : null,
          due_day: kind === "credit_card" && dueDay ? Number(dueDay) : null,
          credit_limit: kind === "credit_card" && creditLimit ? Number(creditLimit) : null,
        },
        { onConflict: "organization_id,account_key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setAccountName("");
      setAccountKey("");
      setInstitution("");
      setInitialBalance("");
      setInitialBalanceDate(today());
      setClosingDay("");
      setDueDay("");
      setCreditLimit("");
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

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  const balanceByAccountId = new Map(
    (balancesQuery.data ?? []).map((row) => [row.account_id, row]),
  );
  const cardSummaryByAccountId = new Map(
    (cardSummaryQuery.data ?? []).map((row) => [row.account_id, row]),
  );
  const checkingBalances = balancesQuery.data ?? [];
  const consolidatedBalance = checkingBalances.reduce((sum, row) => sum + row.current_balance, 0);

  return (
    <AppShell
      activeSection="cadastros"
      title="Contas e cartões"
      subtitle="Contas e cartões usados nos lançamentos"
    >
      <CadastrosTabs value="contas" />
      <Card>
        <CardHeader>
          <CardTitle>Nova conta ou cartão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Nome</Label>
              <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
            </div>
            <div>
              <Label>Chave da conta</Label>
              <Input value={accountKey} onChange={(event) => setAccountKey(event.target.value)} />
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
            {kind === "checking" ? (
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
              onClick={() => addAccount.mutate()}
              disabled={!accountName || !accountKey}
            >
              Salvar conta
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
          <div className="grid gap-3 md:grid-cols-2">
            {(accountsQuery.data ?? []).map((account) => {
              const KindIcon = accountKindIcon(account.kind);
              const balance = balanceByAccountId.get(account.id);
              const cardSummary = cardSummaryByAccountId.get(account.id);
              return (
                <div
                  key={account.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
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
                          {accountKindLabel[account.kind]}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archiveAccount(account.id, account.archived)}
                    >
                      {account.archived ? "Reativar" : "Arquivar"}
                    </Button>
                  </div>

                  {account.kind === "checking" ? (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {balance && account.initial_balance_date ? (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Saldo atual</span>
                          <strong
                            className={
                              balance.current_balance < 0 ? "text-red-700" : "text-emerald-700"
                            }
                          >
                            {formatCurrency(balance.current_balance)}
                          </strong>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Defina o saldo inicial e a data de referência para calcular o saldo atual.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {account.kind === "credit_card" ? (
                    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Fatura do mês corrente</span>
                        <strong>{formatCurrency(cardSummary?.current_invoice_total ?? 0)}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Parcelas futuras em aberto</span>
                        <strong>
                          {formatCurrency(cardSummary?.future_installments_total ?? 0)}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Limite utilizado</span>
                        <strong>{formatCurrency(cardSummary?.limit_used ?? 0)}</strong>
                      </div>
                      {account.credit_limit != null ? (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Limite disponível</span>
                          <strong
                            className={
                              (cardSummary?.limit_available ?? 0) < 0
                                ? "text-red-700"
                                : "text-emerald-700"
                            }
                          >
                            {formatCurrency(cardSummary?.limit_available ?? account.credit_limit)}
                          </strong>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Defina o limite do cartão para ver o disponível.
                        </p>
                      )}
                      {account.closing_day == null ? (
                        <p className="text-xs text-muted-foreground">
                          Defina o dia de fechamento para calcular a fatura corretamente.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
