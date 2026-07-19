import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  Pause,
  Pencil,
  Play,
  PiggyBank,
  Sprout,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { PlanejamentoTabs } from "@/components/finance/PlanejamentoTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { leafCategoryOptions } from "@/lib/finance/categories";
import {
  addGoalProgress,
  archiveGoal,
  createGoal,
  fetchAccountBalances,
  fetchAccounts,
  fetchAllGoalProgress,
  fetchCategories,
  fetchGoalMembers,
  fetchGoals,
  fetchGoalsRealized,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  setGoalMembers,
  setGoalStatus,
  updateGoal,
  type GoalInput,
} from "@/lib/finance/data";
import { goalPace, goalProgressFraction } from "@/lib/finance/goals";
import {
  formatCurrency,
  goalPeriodLabel,
  goalTypeLabel,
  memberDisplayName,
  type GoalPeriod,
  type GoalRow,
  type GoalType,
} from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planejamento/metas")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Metas e objetivos" }] }),
  component: MetasRoute,
});

const GOAL_TYPE_ICON: Record<GoalType, typeof Target> = {
  spending_limit: Wallet,
  savings_result: PiggyBank,
  investment: TrendingUp,
  long_term: Sprout,
};

const GOAL_TYPE_EXAMPLE: Record<GoalType, string> = {
  spending_limit: "Ex: gastar no máximo R$ 8.000 no cartão por mês.",
  savings_result: "Ex: ter uma sobra mensal mínima de R$ 3.000.",
  investment: "Ex: investir R$ 2.000 por mês.",
  long_term: "Ex: acumular R$ 500.000 até dezembro de 2035.",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  name: string;
  description: string;
  targetAmount: string;
  periodType: GoalPeriod;
  startDate: string;
  endDate: string;
  accountId: string;
  categoryId: string;
  initialAmount: string;
  currentAmount: string;
  monthlyContribution: string;
  estimatedReturnRate: string;
  autoTracked: boolean;
  memberIds: string[];
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    targetAmount: "",
    periodType: "monthly",
    startDate: today(),
    endDate: "",
    accountId: "none",
    categoryId: "none",
    initialAmount: "",
    currentAmount: "",
    monthlyContribution: "",
    estimatedReturnRate: "",
    autoTracked: true,
    memberIds: [],
  };
}

function num(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function MetasRoute() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

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
  const balancesQuery = useQuery({
    queryKey: ["account-balances", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccountBalances(orgId!),
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
  const goalsQuery = useQuery({
    queryKey: ["goals", orgId],
    enabled: !!orgId,
    queryFn: () => fetchGoals(orgId!),
  });
  const goalMembersQuery = useQuery({
    queryKey: ["goal-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchGoalMembers(),
  });
  const goalProgressQuery = useQuery({
    queryKey: ["goal-progress-all", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAllGoalProgress(),
  });
  const referenceDate = today();
  const realizedQuery = useQuery({
    queryKey: ["goals-realized", orgId, referenceDate],
    enabled: !!orgId,
    queryFn: () => fetchGoalsRealized(orgId!, referenceDate),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<GoalType | null>(null);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [progressGoal, setProgressGoal] = useState<GoalRow | null>(null);
  const [progressAmount, setProgressAmount] = useState("");

  function openCreate() {
    setEditingGoal(null);
    setCreateType(null);
    setForm(emptyForm());
    setCreateOpen(true);
  }

  function openEdit(goal: GoalRow, currentMemberIds: string[]) {
    setEditingGoal(goal);
    setCreateType(goal.goal_type);
    setForm({
      name: goal.name,
      description: goal.description ?? "",
      targetAmount: String(goal.target_amount),
      periodType: goal.period_type,
      startDate: goal.start_date.slice(0, 10),
      endDate: goal.end_date ? goal.end_date.slice(0, 10) : "",
      accountId: goal.account_id ?? "none",
      categoryId: goal.category_id ?? "none",
      initialAmount: goal.initial_amount != null ? String(goal.initial_amount) : "",
      currentAmount: goal.current_amount != null ? String(goal.current_amount) : "",
      monthlyContribution:
        goal.monthly_contribution != null ? String(goal.monthly_contribution) : "",
      estimatedReturnRate:
        goal.estimated_return_rate != null ? String(goal.estimated_return_rate) : "",
      autoTracked: goal.auto_tracked,
      memberIds: currentMemberIds,
    });
    setCreateOpen(true);
  }

  const saveGoal = useMutation({
    mutationFn: async () => {
      if (!orgId || !createType || !form.name || !form.targetAmount) return;
      const input: GoalInput = {
        goal_type: createType,
        name: form.name,
        description: form.description || null,
        period_type: form.periodType,
        target_amount: num(form.targetAmount) ?? 0,
        initial_amount: num(form.initialAmount),
        current_amount: num(form.currentAmount),
        monthly_contribution: num(form.monthlyContribution),
        estimated_return_rate: num(form.estimatedReturnRate),
        start_date: form.startDate,
        end_date: form.endDate || null,
        account_id: form.accountId === "none" ? null : form.accountId,
        category_id: form.categoryId === "none" ? null : form.categoryId,
        auto_tracked: createType === "long_term" ? form.autoTracked : true,
      };
      const goalId = editingGoal
        ? (await updateGoal(editingGoal.id, input), editingGoal.id)
        : await createGoal(orgId, currentUserId, input);
      await setGoalMembers(goalId, form.memberIds);
    },
    onSuccess: async () => {
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["goals", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["goal-members", orgId] });
    },
  });

  const changeStatus = useMutation({
    mutationFn: async ({ goalId, status }: { goalId: string; status: GoalRow["status"] }) =>
      setGoalStatus(goalId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals", orgId] });
    },
  });

  const removeGoal = useMutation({
    mutationFn: async (goalId: string) => archiveGoal(goalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals", orgId] });
    },
  });

  const saveProgress = useMutation({
    mutationFn: async () => {
      if (!progressGoal) return;
      const amount = num(progressAmount);
      if (amount == null) return;
      await addGoalProgress(progressGoal.id, currentUserId, amount, today(), null);
    },
    onSuccess: async () => {
      setProgressGoal(null);
      setProgressAmount("");
      await queryClient.invalidateQueries({ queryKey: ["goal-progress-all", orgId] });
    },
  });

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  const profileById = new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile]));
  const memberById = new Map((membersQuery.data ?? []).map((member) => [member.user_id, member]));
  const categories = categoriesQuery.data ?? [];
  const categoryItems = leafCategoryOptions(categories);
  const accounts = accountsQuery.data ?? [];
  const balanceByAccountId = new Map(
    (balancesQuery.data ?? []).map((row) => [row.account_id, row]),
  );
  const goals = goalsQuery.data ?? [];
  const membersByGoal = new Map<string, string[]>();
  for (const row of goalMembersQuery.data ?? []) {
    const list = membersByGoal.get(row.goal_id) ?? [];
    list.push(row.member_user_id);
    membersByGoal.set(row.goal_id, list);
  }
  const realizedByGoal = new Map((realizedQuery.data ?? []).map((row) => [row.goal_id, row]));
  const latestProgressByGoal = new Map<string, number>();
  for (const row of goalProgressQuery.data ?? []) {
    if (!latestProgressByGoal.has(row.goal_id)) latestProgressByGoal.set(row.goal_id, row.amount);
  }

  function progressFor(goal: GoalRow) {
    if (goal.goal_type === "long_term") {
      if (goal.account_id && goal.auto_tracked) {
        const account = accounts.find((a) => a.account_key === goal.account_id);
        const balance = account ? balanceByAccountId.get(account.id) : undefined;
        if (balance) return { amount: balance.current_balance, periodStart: null, periodEnd: null };
      }
      const latest = latestProgressByGoal.get(goal.id);
      return { amount: latest ?? goal.initial_amount ?? 0, periodStart: null, periodEnd: null };
    }
    const realized = realizedByGoal.get(goal.id);
    return {
      amount: realized?.realized_amount ?? 0,
      periodStart: realized?.period_start ?? null,
      periodEnd: realized?.period_end ?? null,
    };
  }

  return (
    <AppShell
      activeSection="planejamento"
      title="Planejamento"
      subtitle="Metas e objetivos financeiros da família"
    >
      <PlanejamentoTabs value="metas" />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Metas e objetivos</CardTitle>
          <Button type="button" onClick={openCreate}>
            <Target className="mr-2 h-4 w-4" />
            Nova meta
          </Button>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma meta cadastrada ainda. Crie a primeira para começar a acompanhar.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {goals.map((goal) => {
                const progress = progressFor(goal);
                const fraction = goalProgressFraction(goal, progress.amount);
                const pace = goalPace(goal, progress, new Date());
                const Icon = GOAL_TYPE_ICON[goal.goal_type];
                const goalMemberIds = membersByGoal.get(goal.id) ?? [];
                const memberNames = goalMemberIds.map((id) =>
                  id === currentUserId ? "Eu" : memberDisplayName(profileById.get(id), id),
                );
                return (
                  <div
                    key={goal.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <strong className="leading-tight">{goal.name}</strong>
                          <p className="text-xs text-muted-foreground">
                            {goalTypeLabel[goal.goal_type]}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          pace.tone === "good" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-700",
                          pace.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
                          pace.tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600",
                        )}
                      >
                        {pace.label}
                      </Badge>
                    </div>

                    {goal.description ? (
                      <p className="text-xs text-muted-foreground">{goal.description}</p>
                    ) : null}

                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatCurrency(progress.amount)}</span>
                        <span>{formatCurrency(goal.target_amount)}</span>
                      </div>
                      <Progress value={fraction * 100} className="mt-1" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(fraction * 100).toFixed(0)}% ·{" "}
                        {goal.goal_type === "long_term"
                          ? goal.end_date
                            ? `até ${new Date(goal.end_date).toLocaleDateString("pt-BR")}`
                            : "sem prazo definido"
                          : goalPeriodLabel[goal.period_type]}
                      </p>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {memberNames.length > 0 ? memberNames.join(", ") : "Toda a família"}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => openEdit(goal, goalMemberIds)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        Editar
                      </Button>
                      {goal.goal_type === "long_term" && !goal.account_id ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setProgressGoal(goal);
                            setProgressAmount(String(progress.amount || ""));
                          }}
                        >
                          <Landmark className="mr-1 h-3 w-3" />
                          Atualizar valor
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          changeStatus.mutate({
                            goalId: goal.id,
                            status: goal.status === "paused" ? "active" : "paused",
                          })
                        }
                      >
                        {goal.status === "paused" ? (
                          <Play className="mr-1 h-3 w-3" />
                        ) : (
                          <Pause className="mr-1 h-3 w-3" />
                        )}
                        {goal.status === "paused" ? "Retomar" : "Pausar"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-7 w-7 text-slate-400 hover:text-red-600"
                        aria-label="Excluir meta"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Excluir meta",
                            description: `Excluir a meta "${goal.name}"?`,
                            confirmLabel: "Excluir",
                            destructive: true,
                          });
                          if (ok) removeGoal.mutate(goal.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criar/editar meta */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {!createType ? (
            <>
              <DialogHeader>
                <DialogTitle>Nova meta</DialogTitle>
                <DialogDescription>Que tipo de meta você quer acompanhar?</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(goalTypeLabel) as GoalType[]).map((type) => {
                  const Icon = GOAL_TYPE_ICON[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-4 text-left text-sm hover:border-emerald-300 hover:bg-emerald-50/40"
                      onClick={() => setCreateType(type)}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <strong>{goalTypeLabel[type]}</strong>
                      <span className="text-xs text-muted-foreground">
                        {GOAL_TYPE_EXAMPLE[type]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editingGoal ? "Editar meta" : `Nova meta — ${goalTypeLabel[createType]}`}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input
                    autoFocus
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{createType === "long_term" ? "Valor-alvo" : "Valor da meta"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.targetAmount}
                      onChange={(event) => setForm({ ...form, targetAmount: event.target.value })}
                    />
                  </div>
                  {createType !== "long_term" ? (
                    <div>
                      <Label>Periodicidade</Label>
                      <Select
                        value={form.periodType}
                        onValueChange={(value) =>
                          setForm({ ...form, periodType: value as GoalPeriod })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">{goalPeriodLabel.monthly}</SelectItem>
                          <SelectItem value="yearly">{goalPeriodLabel.yearly}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <Label>Valor inicial</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.initialAmount}
                        onChange={(event) =>
                          setForm({ ...form, initialAmount: event.target.value })
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data inicial</Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                    />
                  </div>
                  <div>
                    <Label>
                      {createType === "long_term" ? "Data-alvo" : "Data final (opcional)"}
                    </Label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                    />
                  </div>
                </div>

                {createType === "long_term" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Contribuição mensal (opcional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.monthlyContribution}
                        onChange={(event) =>
                          setForm({ ...form, monthlyContribution: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Rendimento estimado % (opcional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.estimatedReturnRate}
                        onChange={(event) =>
                          setForm({ ...form, estimatedReturnRate: event.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : null}

                {(createType === "spending_limit" || createType === "investment") && (
                  <div>
                    <Label>Categoria relacionada (opcional)</Label>
                    <Select
                      value={form.categoryId}
                      onValueChange={(value) => setForm({ ...form, categoryId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {categoryItems.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {createType !== "savings_result" && (
                  <div>
                    <Label>
                      {createType === "long_term"
                        ? "Conta vinculada (opcional — acompanha o saldo automaticamente)"
                        : "Conta ou cartão relacionado (opcional)"}
                    </Label>
                    <Select
                      value={form.accountId}
                      onValueChange={(value) =>
                        setForm({
                          ...form,
                          accountId: value,
                          autoTracked: value !== "none" ? true : form.autoTracked,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {accounts
                          .filter((account) => account.account_key)
                          .map((account) => (
                            <SelectItem key={account.id} value={account.account_key}>
                              {account.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Membros (deixe vazio para toda a família)</Label>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {(membersQuery.data ?? []).map((member) => {
                      const checked = form.memberIds.includes(member.user_id);
                      return (
                        <label
                          key={member.user_id}
                          className="flex items-center gap-1.5 text-sm text-slate-600"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) =>
                              setForm({
                                ...form,
                                memberIds: next
                                  ? [...form.memberIds, member.user_id]
                                  : form.memberIds.filter((id) => id !== member.user_id),
                              })
                            }
                          />
                          {member.user_id === currentUserId
                            ? "Eu"
                            : memberDisplayName(profileById.get(member.user_id), member.user_id)}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => (editingGoal ? setCreateOpen(false) : setCreateType(null))}
                >
                  {editingGoal ? "Cancelar" : "Voltar"}
                </Button>
                <Button
                  type="button"
                  onClick={() => saveGoal.mutate()}
                  disabled={!form.name || !form.targetAmount || saveGoal.isPending}
                >
                  {editingGoal ? "Salvar alterações" : "Criar meta"}
                </Button>
              </DialogFooter>
              {saveGoal.error ? (
                <p className="text-sm text-red-700">
                  {saveGoal.error instanceof Error
                    ? saveGoal.error.message
                    : String(saveGoal.error)}
                </p>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Atualizar valor atual (objetivo de longo prazo manual) */}
      <Dialog open={!!progressGoal} onOpenChange={(open) => !open && setProgressGoal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar valor atual</DialogTitle>
            <DialogDescription>{progressGoal?.name}</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Valor atual</Label>
            <Input
              type="number"
              step="0.01"
              autoFocus
              value={progressAmount}
              onChange={(event) => setProgressAmount(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setProgressGoal(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveProgress.mutate()}
              disabled={!progressAmount || saveProgress.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
