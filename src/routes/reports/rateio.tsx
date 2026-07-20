import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Download,
  Save,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { AnalyticsTabs } from "@/components/finance/AnalyticsTabs";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatDateBR } from "@/lib/finance/date-utils";
import {
  fetchAccounts,
  fetchCategories,
  fetchExpenseSplitMembers,
  fetchExpenseSplitSettlements,
  fetchExpenseSplits,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  saveExpenseSplit,
  updateSettlementStatus,
} from "@/lib/finance/data";
import {
  calculateExpenseSplit,
  fromCents,
  resolvePayer,
  simplifySettlements,
  toCents,
  type SplitMode,
} from "@/lib/finance/expense-split";
import { resolveMemberColor, resolveMemberName } from "@/lib/finance/member-visuals";
import { formatCurrency, type CategoryRow, type TxnRow } from "@/lib/finance/types";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports/rateio")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Rateio de despesas" }] }),
  component: RateioRoute,
});

type PeriodPreset = "current_month" | "previous_month" | "year" | "custom";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function periodForPreset(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date();
  if (preset === "current_month") {
    return {
      start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (preset === "previous_month") {
    return {
      start: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === "year") {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
  }
  return { start: isoDate(now), end: isoDate(now) };
}

function categoryPathOf(categories: CategoryRow[], categoryId: string | null): string {
  if (!categoryId) return "Sem categoria";
  return leafCategoryOptions(categories).find((c) => c.id === categoryId)?.path ?? "Categoria";
}

function RateioRoute() {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
  const currentUserId = currentUserQuery.data?.id ?? null;
  const { orgId } = useActiveOrganization(currentUserId);

  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });
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
  const memberIds = (membersQuery.data ?? []).map((m) => m.user_id);
  const profilesQuery = useQuery({
    queryKey: ["member-profiles", orgId, memberIds],
    enabled: !!orgId && memberIds.length > 0,
    queryFn: () => fetchMemberProfiles(memberIds),
  });

  // ── Período e filtros ────────────────────────────────────────────────
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [customStart, setCustomStart] = useState(isoDate(new Date()));
  const [customEnd, setCustomEnd] = useState(isoDate(new Date()));
  const period =
    preset === "custom" ? { start: customStart, end: customEnd } : periodForPreset(preset);

  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [payerFilter, setPayerFilter] = useState<string[]>([]);
  const [descriptionSearch, setDescriptionSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "aberto" | "consolidado">("all");

  const transactionsQuery = useQuery({
    queryKey: ["expense-split-transactions", orgId, period.start, period.end],
    enabled: !!orgId,
    queryFn: async () => {
      const endExclusive = new Date(`${period.end}T00:00:00`);
      endExclusive.setDate(endExclusive.getDate() + 1);
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, description, amount, posted_at, type, account_id, account_kind, payment_method, entry_source, currency, category_id, created_by, spent_by_member_id, installment_number, installment_plan_id, classification_method, classification_confidence, needs_review, consolidation_status",
        )
        .eq("organization_id", orgId!)
        .gte("posted_at", `${period.start}T00:00:00`)
        .lt("posted_at", endExclusive.toISOString())
        .lt("amount", 0)
        .order("posted_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as TxnRow[];
    },
  });

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const profileById = new Map((profilesQuery.data ?? []).map((p) => [p.id, p]));
  const memberById = new Map(members.map((m) => [m.user_id, m]));

  function memberName(id: string) {
    return id === currentUserId
      ? "Eu"
      : resolveMemberName(memberById.get(id), profileById.get(id), id);
  }

  // Sobrepõe manualmente o pagador de transações sem identificação — só
  // pra efeito deste cálculo, não altera a transação original.
  const [payerOverrides, setPayerOverrides] = useState<Map<string, string>>(new Map());

  function effectivePayer(transaction: TxnRow): string | null {
    return payerOverrides.get(transaction.id) ?? resolvePayer(transaction, accounts);
  }

  const filteredTransactions = useMemo(() => {
    const all = transactionsQuery.data ?? [];
    const search = descriptionSearch.trim().toLowerCase();
    return all.filter((t) => {
      if (categoryFilter.length > 0 && !(t.category_id && categoryFilter.includes(t.category_id))) {
        return false;
      }
      if (accountFilter.length > 0 && !accountFilter.includes(t.account_id)) return false;
      if (payerFilter.length > 0) {
        const payer = payerOverrides.get(t.id) ?? resolvePayer(t, accounts);
        if (!payer || !payerFilter.includes(payer)) return false;
      }
      if (search && !t.description.toLowerCase().includes(search)) return false;
      if (statusFilter !== "all" && t.consolidation_status !== statusFilter) return false;
      return true;
    });
    // payerOverrides intencionalmente fora das deps — reavaliado a cada render junto do resto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    transactionsQuery.data,
    categoryFilter,
    accountFilter,
    payerFilter,
    descriptionSearch,
    statusFilter,
    accounts,
  ]);

  const totalCents = filteredTransactions.reduce((sum, t) => sum + toCents(Math.abs(t.amount)), 0);
  const unidentified = filteredTransactions.filter((t) => !effectivePayer(t));

  // ── Participação ─────────────────────────────────────────────────────
  const [splitMode, setSplitMode] = useState<SplitMode>("percentage");
  const [includedMembers, setIncludedMembers] = useState<string[]>(() => memberIds);
  const [shares, setShares] = useState<Map<string, string>>(new Map());

  const activeMembers = members.filter((m) => includedMembers.includes(m.user_id));
  const shareSum = activeMembers.reduce((sum, m) => sum + (Number(shares.get(m.user_id)) || 0), 0);
  const shareValid =
    splitMode === "weight"
      ? shareSum > 0
      : Math.abs(shareSum - 100) <= 0.01 && activeMembers.length > 0;

  const paidByCents = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filteredTransactions) {
      const payer = effectivePayer(t);
      if (!payer) continue;
      map.set(payer, (map.get(payer) ?? 0) + toCents(Math.abs(t.amount)));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTransactions, payerOverrides, accounts]);

  const activeMemberIdsKey = activeMembers.map((m) => m.user_id).join(",");
  const results = useMemo(() => {
    if (!shareValid) return [];
    return calculateExpenseSplit(
      totalCents,
      activeMembers.map((m) => ({
        memberId: m.user_id,
        share: Number(shares.get(m.user_id)) || 0,
      })),
      splitMode,
      paidByCents,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCents, activeMemberIdsKey, shares, splitMode, paidByCents, shareValid]);

  const settlements = useMemo(() => simplifySettlements(results), [results]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [splitName, setSplitName] = useState("");

  const saveSplit = useMutation({
    mutationFn: async () => {
      if (!orgId || !shareValid) return;
      await saveExpenseSplit(orgId, currentUserId, {
        name: splitName || null,
        periodStart: period.start,
        periodEnd: period.end,
        filters: {
          categoryIds: categoryFilter,
          accountIds: accountFilter,
          memberIds: payerFilter,
          description: descriptionSearch || undefined,
          consolidationStatus: statusFilter,
        },
        splitMode,
        transactionIds: filteredTransactions.map((t) => t.id),
        totalAmount: fromCents(totalCents),
        members: results.map((r) => ({
          memberUserId: r.memberId,
          share: r.participationPercent,
          shouldPayAmount: fromCents(r.shouldPayCents),
          paidAmount: fromCents(r.paidCents),
          balanceAmount: fromCents(r.balanceCents),
        })),
        settlements: settlements.map((s) => ({
          fromMemberUserId: s.fromMemberId,
          toMemberUserId: s.toMemberId,
          amount: fromCents(s.amountCents),
        })),
      });
    },
    onSuccess: async () => {
      setSplitName("");
      await queryClient.invalidateQueries({ queryKey: ["expense-splits", orgId] });
    },
  });

  function summaryText(): string {
    const lines = [
      `Rateio de despesas — ${formatDateBR(period.start)} a ${formatDateBR(period.end)}`,
      `Total: ${formatCurrency(fromCents(totalCents))} (${filteredTransactions.length} lançamentos)`,
      "",
    ];
    for (const r of results) {
      const balance = fromCents(r.balanceCents);
      const situacao =
        balance > 0.005 ? "tem a receber" : balance < -0.005 ? "tem a pagar" : "quitado";
      lines.push(
        `${memberName(r.memberId)}: participação ${r.participationPercent.toFixed(1)}% · deveria pagar ${formatCurrency(fromCents(r.shouldPayCents))} · pagou ${formatCurrency(fromCents(r.paidCents))} · ${situacao} ${formatCurrency(Math.abs(balance))}`,
      );
    }
    if (settlements.length > 0) {
      lines.push("", "Sugestão de compensação:");
      for (const s of settlements) {
        lines.push(
          `${memberName(s.fromMemberId)} paga ${formatCurrency(fromCents(s.amountCents))} para ${memberName(s.toMemberId)}.`,
        );
      }
    }
    return lines.join("\n");
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summaryText());
  }

  function exportCsv() {
    const rows = [
      ["Membro", "Participação (%)", "Deveria pagar", "Pagou", "Saldo"],
      ...results.map((r) => [
        memberName(r.memberId),
        r.participationPercent.toFixed(2),
        fromCents(r.shouldPayCents).toFixed(2),
        fromCents(r.paidCents).toFixed(2),
        fromCents(r.balanceCents).toFixed(2),
      ]),
      [],
      ["De", "Para", "Valor"],
      ...settlements.map((s) => [
        memberName(s.fromMemberId),
        memberName(s.toMemberId),
        fromCents(s.amountCents).toFixed(2),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rateio-${period.start}-a-${period.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Histórico ────────────────────────────────────────────────────────
  const splitsQuery = useQuery({
    queryKey: ["expense-splits", orgId],
    enabled: !!orgId,
    queryFn: () => fetchExpenseSplits(orgId!),
  });
  const [expandedSplitId, setExpandedSplitId] = useState<string | null>(null);
  const splitDetailQuery = useQuery({
    queryKey: ["expense-split-detail", expandedSplitId],
    enabled: !!expandedSplitId,
    queryFn: async () => {
      const [splitMembers, splitSettlements] = await Promise.all([
        fetchExpenseSplitMembers(expandedSplitId!),
        fetchExpenseSplitSettlements(expandedSplitId!),
      ]);
      return { splitMembers, splitSettlements };
    },
  });
  const toggleSettlement = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "paid" }) =>
      updateSettlementStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["expense-split-detail", expandedSplitId] });
    },
  });

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  return (
    <AppShell activeSection="analytics" title="Rateio de despesas" subtitle="Quem deve pagar quem">
      <AnalyticsTabs value="reports" />

      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Intervalo</Label>
            <Select value={preset} onValueChange={(value) => setPreset(value as PeriodPreset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Mês atual</SelectItem>
                <SelectItem value="previous_month">Mês anterior</SelectItem>
                <SelectItem value="year">Este ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" ? (
            <>
              <div>
                <Label>De</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div>
                <Label>Até</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label>Descrição</Label>
            <Input
              placeholder="Buscar por descrição..."
              value={descriptionSearch}
              onChange={(e) => setDescriptionSearch(e.target.value)}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="consolidado">Consolidado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categorias (vazio = todas)</Label>
            <div className="mt-1 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {leafCategoryOptions(categories).map((category) => {
                const checked = categoryFilter.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      checked
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600",
                    )}
                    onClick={() =>
                      setCategoryFilter((current) =>
                        checked
                          ? current.filter((id) => id !== category.id)
                          : [...current, category.id],
                      )
                    }
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Contas/cartões (vazio = todas)</Label>
            <div className="mt-1 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
              {accounts.map((account) => {
                const checked = accountFilter.includes(account.account_key);
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      checked
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600",
                    )}
                    onClick={() =>
                      setAccountFilter((current) =>
                        checked
                          ? current.filter((id) => id !== account.account_key)
                          : [...current, account.account_key],
                      )
                    }
                  >
                    {account.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="lg:col-span-2">
            <Label>Pagador (vazio = todos)</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {members.map((member) => {
                const checked = payerFilter.includes(member.user_id);
                return (
                  <button
                    key={member.user_id}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      checked
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600",
                    )}
                    onClick={() =>
                      setPayerFilter((current) =>
                        checked
                          ? current.filter((id) => id !== member.user_id)
                          : [...current, member.user_id],
                      )
                    }
                  >
                    {memberName(member.user_id)}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
        <CardContent className="border-t border-slate-100 pt-4">
          <p className="text-sm text-muted-foreground">
            {filteredTransactions.length} lançamento(s) · total filtrado{" "}
            <strong className="text-slate-900">{formatCurrency(fromCents(totalCents))}</strong>
          </p>
        </CardContent>
      </Card>

      {unidentified.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>
                {unidentified.length} lançamento(s) sem pagador identificado, totalizando{" "}
                {formatCurrency(unidentified.reduce((sum, t) => sum + Math.abs(t.amount), 0))}.
                Defina manualmente antes de fechar o rateio.
              </p>
            </div>
            <div className="space-y-1.5">
              {unidentified.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-amber-900">
                    {t.description} · {formatCurrency(Math.abs(t.amount))} ·{" "}
                    {formatDateBR(t.posted_at)}
                  </span>
                  <Select
                    value={payerOverrides.get(t.id) ?? ""}
                    onValueChange={(value) =>
                      setPayerOverrides((current) => new Map(current).set(t.id, value))
                    }
                  >
                    <SelectTrigger className="h-7 w-40 bg-white text-xs">
                      <SelectValue placeholder="Definir pagador" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {memberName(member.user_id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Participação</CardTitle>
          <Select value={splitMode} onValueChange={(v) => setSplitMode(v as SplitMode)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentual</SelectItem>
              <SelectItem value="weight">Partes/peso</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((member) => {
            const included = includedMembers.includes(member.user_id);
            return (
              <div key={member.user_id} className="flex items-center gap-3">
                <Checkbox
                  checked={included}
                  onCheckedChange={(next) =>
                    setIncludedMembers((current) =>
                      next
                        ? [...current, member.user_id]
                        : current.filter((id) => id !== member.user_id),
                    )
                  }
                />
                <span className="w-40 truncate text-sm">{memberName(member.user_id)}</span>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 w-28"
                  disabled={!included}
                  value={shares.get(member.user_id) ?? ""}
                  onChange={(event) =>
                    setShares((current) => new Map(current).set(member.user_id, event.target.value))
                  }
                  placeholder={splitMode === "percentage" ? "%" : "partes"}
                />
              </div>
            );
          })}
          {splitMode === "percentage" ? (
            <p className={cn("text-xs", shareValid ? "text-emerald-700" : "text-red-700")}>
              Soma: {shareSum.toFixed(2)}% {shareValid ? "" : "(precisa somar exatamente 100%)"}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!shareValid ? (
            <p className="text-sm text-muted-foreground">
              Ajuste a participação acima (soma de 100% no modo percentual) para calcular o rateio.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2">Membro</th>
                      <th className="py-2 text-right">Participação</th>
                      <th className="py-2 text-right">Deveria pagar</th>
                      <th className="py-2 text-right">Pagou</th>
                      <th className="py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const balance = fromCents(r.balanceCents);
                      const quitado = Math.abs(balance) < 0.005;
                      const receber = balance > 0;
                      return (
                        <tr key={r.memberId} className="border-b">
                          <td className="flex items-center gap-2 py-2">
                            <MemberAvatar
                              name={memberName(r.memberId)}
                              color={resolveMemberColor(
                                r.memberId,
                                memberById.get(r.memberId)?.color ?? null,
                              )}
                            />
                            {memberName(r.memberId)}
                          </td>
                          <td className="py-2 text-right">{r.participationPercent.toFixed(1)}%</td>
                          <td className="py-2 text-right">
                            {formatCurrency(fromCents(r.shouldPayCents))}
                          </td>
                          <td className="py-2 text-right">
                            {formatCurrency(fromCents(r.paidCents))}
                          </td>
                          <td
                            className={cn(
                              "py-2 text-right font-medium",
                              quitado
                                ? "text-slate-500"
                                : receber
                                  ? "text-emerald-700"
                                  : "text-red-700",
                            )}
                          >
                            {quitado
                              ? "Quitado"
                              : `${formatCurrency(Math.abs(balance))} ${receber ? "a receber" : "a pagar"}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {settlements.length > 0 ? (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
                    Sugestão de compensação
                  </p>
                  <div className="space-y-1 text-sm">
                    {settlements.map((s, index) => (
                      <p key={index}>
                        <strong>{memberName(s.fromMemberId)}</strong> deve pagar{" "}
                        <strong>{formatCurrency(fromCents(s.amountCents))}</strong> para{" "}
                        <strong>{memberName(s.toMemberId)}</strong>.
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-emerald-700">
                  Ninguém precisa compensar ninguém — está tudo quitado.
                </p>
              )}

              <button
                type="button"
                className="flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                onClick={() => setDetailOpen((v) => !v)}
              >
                {detailOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {detailOpen ? "Ocultar" : "Ver"} detalhamento ({filteredTransactions.length}{" "}
                lançamentos)
              </button>
              {detailOpen ? (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-xs">
                  {filteredTransactions.map((t) => {
                    const payer = effectivePayer(t);
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 border-b py-1 last:border-0"
                      >
                        <span className="truncate">
                          {t.description} · {categoryPathOf(categories, t.category_id)} ·{" "}
                          {formatDateBR(t.posted_at)}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {formatCurrency(Math.abs(t.amount))}
                          <Badge variant="outline" className="text-[10px]">
                            {payer ? memberName(payer) : "Sem pagador"}
                          </Badge>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <Input
                  placeholder="Nome do rateio (opcional)"
                  className="h-9 w-56"
                  value={splitName}
                  onChange={(e) => setSplitName(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" onClick={copySummary}>
                  <Clipboard className="mr-1.5 h-3.5 w-3.5" />
                  Copiar resumo
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Exportar CSV
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saveSplit.isPending || filteredTransactions.length === 0}
                  onClick={() => saveSplit.mutate()}
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Salvar rateio
                </Button>
                {saveSplit.isSuccess ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Salvo!
                  </span>
                ) : null}
              </div>
              {saveSplit.error ? (
                <p className="text-sm text-red-700">
                  {saveSplit.error instanceof Error
                    ? saveSplit.error.message
                    : String(saveSplit.error)}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rateios salvos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(splitsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum rateio salvo ainda.</p>
          ) : (
            (splitsQuery.data ?? []).map((split) => {
              const expanded = expandedSplitId === split.id;
              return (
                <div key={split.id} className="rounded-lg border border-slate-200">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm"
                    onClick={() => setExpandedSplitId(expanded ? null : split.id)}
                  >
                    <span className="flex items-center gap-2">
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {split.name ||
                        `Rateio de ${formatDateBR(split.period_start)} a ${formatDateBR(split.period_end)}`}
                    </span>
                    <span className="text-muted-foreground">
                      {formatCurrency(split.total_amount)} ·{" "}
                      {new Date(split.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="space-y-3 border-t border-slate-100 p-3">
                      {splitDetailQuery.isLoading ? (
                        <p className="text-xs text-muted-foreground">Carregando…</p>
                      ) : (
                        <>
                          <div className="space-y-1 text-xs">
                            {(splitDetailQuery.data?.splitMembers ?? []).map((m) => (
                              <p key={m.id}>
                                {memberName(m.member_user_id)}: {m.share.toFixed(1)}% · deveria
                                pagar {formatCurrency(m.should_pay_amount)} · pagou{" "}
                                {formatCurrency(m.paid_amount)} · saldo{" "}
                                {formatCurrency(m.balance_amount)}
                              </p>
                            ))}
                          </div>
                          <div className="space-y-1.5">
                            {(splitDetailQuery.data?.splitSettlements ?? []).map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span>
                                  {memberName(s.from_member_user_id)} →{" "}
                                  {memberName(s.to_member_user_id)}: {formatCurrency(s.amount)}
                                </span>
                                <Button
                                  type="button"
                                  variant={s.status === "paid" ? "outline" : "default"}
                                  size="sm"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() =>
                                    toggleSettlement.mutate({
                                      id: s.id,
                                      status: s.status === "paid" ? "pending" : "paid",
                                    })
                                  }
                                >
                                  {s.status === "paid" ? "Marcar pendente" : "Marcar paga"}
                                </Button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
