import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Pause,
  Pencil,
  Play,
  Repeat,
  RotateCcw,
  SkipForward,
  Trash2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { leafCategoryOptions } from "@/lib/finance/categories";
import {
  createRecurringBill,
  ensureRecurringBillOccurrences,
  fetchAccounts,
  fetchCategories,
  fetchRecurringBills,
  fetchRecurringBillsUpcoming,
  fetchTransactions,
  markOccurrencePaid,
  markOccurrenceSkipped,
  reopenOccurrence,
  setRecurringBillStatus,
  updateRecurringBill,
  type RecurringBillInput,
} from "@/lib/finance/data";
import { billOccurrenceState } from "@/lib/finance/recurring-bills";
import {
  dueDateAdjustmentLabel,
  formatCurrency,
  recurrenceFrequencyLabel,
  recurringBillStatusLabel,
  type RecurringBillDueDateAdjustment,
  type RecurringBillFrequency,
  type RecurringBillOccurrenceRow,
  type RecurringBillRow,
} from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planejamento/contas-fixas")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Contas fixas" }] }),
  component: ContasFixasRoute,
});

const HORIZON_DAYS = 180;
const CALENDAR_WINDOW_DAYS = 30;
const MATCH_WINDOW_DAYS = 10;
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const VIEW_MODE_KEY = "calcum:contas-fixas-view";

type ViewMode = "list" | "cards" | "calendar";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Grade de semanas (7 colunas) cobrindo o mês de monthDate, incluindo dias
 *  de meses vizinhos para completar a primeira/última semana. */
function monthGrid(monthDate: Date): Date[][] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Date[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(new Date(year, month, i - firstWeekday + 1));
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(
      new Date(year, month, daysInMonth + (cells.length - firstWeekday - daysInMonth) + 1),
    );
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function num(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** Inverso de addMonths, usado para preencher "prever por quantos meses"
 *  ao editar uma conta fixa que já tem end_date gravado. */
function monthsBetween(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  return Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
  );
}

type FormState = {
  name: string;
  categoryId: string;
  accountId: string;
  expectedAmount: string;
  amountIsVariable: boolean;
  frequency: RecurringBillFrequency;
  dueDay: string;
  dueDateAdjustment: RecurringBillDueDateAdjustment;
  reminderDaysBefore: string;
  startDate: string;
  projectionMonths: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    categoryId: "none",
    accountId: "none",
    expectedAmount: "",
    amountIsVariable: false,
    frequency: "monthly",
    dueDay: "5",
    dueDateAdjustment: "previous_business_day",
    reminderDaysBefore: "3",
    startDate: today(),
    projectionMonths: "",
    notes: "",
  };
}

function ContasFixasRoute() {
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
  const billsQuery = useQuery({
    queryKey: ["recurring-bills", orgId],
    enabled: !!orgId,
    queryFn: () => fetchRecurringBills(orgId!),
  });
  // Garante que as ocorrências dos próximos meses existam (idempotente),
  // depois lê a janela — mesma RPC reaproveitada pelo card do Dashboard.
  // Começa no início do mês corrente (não em "hoje") para a visão de
  // calendário também mostrar os dias já passados do mês, com o que já
  // foi pago.
  const occurrencesQuery = useQuery({
    queryKey: ["recurring-bill-occurrences", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const through = addDays(today(), HORIZON_DAYS);
      await ensureRecurringBillOccurrences(orgId!, through);
      return fetchRecurringBillsUpcoming(orgId!, startOfMonth(today()), through);
    },
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", orgId],
    enabled: !!orgId,
    queryFn: () => fetchTransactions(orgId!),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBillRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [payOccurrence, setPayOccurrence] = useState<RecurringBillOccurrenceRow | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const [linkedTransactionId, setLinkedTransactionId] = useState("none");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(startOfMonth(today())));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "list" || stored === "cards" || stored === "calendar") setViewMode(stored);
  }, []);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  function openCreate() {
    setEditingBill(null);
    setForm(emptyForm());
    setCreateOpen(true);
  }

  function openEdit(bill: RecurringBillRow) {
    setEditingBill(bill);
    setForm({
      name: bill.name,
      categoryId: bill.category_id ?? "none",
      accountId: bill.account_id ?? "none",
      expectedAmount: String(bill.expected_amount),
      amountIsVariable: bill.amount_is_variable,
      frequency: bill.recurrence_frequency,
      dueDay: String(bill.due_day),
      dueDateAdjustment: bill.due_date_adjustment,
      reminderDaysBefore: String(bill.reminder_days_before),
      startDate: bill.start_date.slice(0, 10),
      projectionMonths: bill.end_date
        ? String(monthsBetween(bill.start_date.slice(0, 10), bill.end_date.slice(0, 10)))
        : "",
      notes: bill.notes ?? "",
    });
    setCreateOpen(true);
  }

  const saveBill = useMutation({
    mutationFn: async () => {
      if (!orgId || !form.name || !form.expectedAmount || !form.dueDay) return;
      const input: RecurringBillInput = {
        name: form.name,
        category_id: form.categoryId === "none" ? null : form.categoryId,
        account_id: form.accountId === "none" ? null : form.accountId,
        expected_amount: num(form.expectedAmount) ?? 0,
        amount_is_variable: form.amountIsVariable,
        recurrence_frequency: form.frequency,
        due_day: Number(form.dueDay),
        due_date_adjustment: form.dueDateAdjustment,
        reminder_days_before: Number(form.reminderDaysBefore) || 0,
        start_date: form.startDate,
        end_date: form.projectionMonths
          ? addMonths(form.startDate, Number(form.projectionMonths))
          : null,
        notes: form.notes || null,
      };
      if (editingBill) await updateRecurringBill(editingBill.id, input);
      else await createRecurringBill(orgId, currentUserId, input);
    },
    onSuccess: async () => {
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["recurring-bills", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["recurring-bill-occurrences", orgId] });
    },
  });

  const changeStatus = useMutation({
    mutationFn: async ({
      billId,
      status,
    }: {
      billId: string;
      status: RecurringBillRow["status"];
    }) => setRecurringBillStatus(billId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring-bills", orgId] });
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payOccurrence) return;
      const amount = num(paidAmount);
      if (amount == null) return;
      await markOccurrencePaid(payOccurrence.id, {
        paidAmount: amount,
        paidAt,
        paidBy: currentUserId,
        transactionId: linkedTransactionId === "none" ? null : linkedTransactionId,
      });
    },
    onSuccess: async () => {
      setPayOccurrence(null);
      await queryClient.invalidateQueries({ queryKey: ["recurring-bill-occurrences", orgId] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (occurrenceId: string) => markOccurrenceSkipped(occurrenceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring-bill-occurrences", orgId] });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async (occurrenceId: string) => reopenOccurrence(occurrenceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring-bill-occurrences", orgId] });
    },
  });

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  const categories = categoriesQuery.data ?? [];
  const categoryItems = leafCategoryOptions(categories);
  const accounts = accountsQuery.data ?? [];
  const bills = billsQuery.data ?? [];
  const occurrences = occurrencesQuery.data ?? [];

  const calendarCutoff = addDays(today(), CALENDAR_WINDOW_DAYS);
  const upcomingItems = occurrences
    .filter((o) => o.due_date >= today() && o.due_date <= calendarCutoff)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const futureOccurrences = occurrences
    .filter((o) => o.due_date >= today())
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const nextOccurrenceByBill = new Map<string, RecurringBillOccurrenceRow>();
  for (const occurrence of futureOccurrences) {
    if (!nextOccurrenceByBill.has(occurrence.recurring_bill_id)) {
      nextOccurrenceByBill.set(occurrence.recurring_bill_id, occurrence);
    }
  }

  const occurrencesByDay = new Map<string, RecurringBillOccurrenceRow[]>();
  for (const occurrence of occurrences) {
    const list = occurrencesByDay.get(occurrence.due_date) ?? [];
    list.push(occurrence);
    occurrencesByDay.set(occurrence.due_date, list);
  }
  const earliestCalendarMonth = startOfMonth(today());
  const latestCalendarMonth = startOfMonth(addDays(today(), HORIZON_DAYS));
  const calendarMonthKey = startOfMonth(dateKey(calendarMonth));
  const canGoPrevMonth = calendarMonthKey > earliestCalendarMonth;
  const canGoNextMonth = calendarMonthKey < latestCalendarMonth;

  function shiftCalendarMonth(delta: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function candidateTransactions(occurrence: RecurringBillOccurrenceRow) {
    const dueTime = new Date(occurrence.due_date).getTime();
    const windowMs = MATCH_WINDOW_DAYS * 86_400_000;
    return (transactionsQuery.data ?? [])
      .filter((t) => Number(t.amount) < 0)
      .filter((t) => Math.abs(new Date(t.posted_at).getTime() - dueTime) <= windowMs)
      .sort(
        (a, b) =>
          Math.abs(new Date(a.posted_at).getTime() - dueTime) -
          Math.abs(new Date(b.posted_at).getTime() - dueTime),
      )
      .slice(0, 15);
  }

  function openPay(occurrence: RecurringBillOccurrenceRow) {
    setPayOccurrence(occurrence);
    setPaidAmount(String(occurrence.expected_amount));
    setPaidAt(today());
    setLinkedTransactionId("none");
  }

  function billStatusBadgeClass(status: RecurringBillRow["status"]) {
    return cn(
      status === "active" && "border-emerald-200 bg-emerald-50 text-emerald-700",
      status === "paused" && "border-amber-200 bg-amber-50 text-amber-700",
      status === "archived" && "border-slate-200 bg-slate-50 text-slate-600",
    );
  }

  function occurrenceBadgeClass(tone: ReturnType<typeof billOccurrenceState>["tone"]) {
    return cn(
      tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
      tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
      tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600",
    );
  }

  /** Editar/pausar-retomar/arquivar — reaproveitado pelas visões de cards e lista. */
  function renderBillActions(bill: RecurringBillRow) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => openEdit(bill)}
        >
          <Pencil className="mr-1 h-3 w-3" />
          Editar
        </Button>
        {bill.status !== "archived" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() =>
              changeStatus.mutate({
                billId: bill.id,
                status: bill.status === "paused" ? "active" : "paused",
              })
            }
          >
            {bill.status === "paused" ? (
              <Play className="mr-1 h-3 w-3" />
            ) : (
              <Pause className="mr-1 h-3 w-3" />
            )}
            {bill.status === "paused" ? "Retomar" : "Pausar"}
          </Button>
        ) : null}
        {bill.status !== "archived" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-red-600"
            aria-label="Arquivar conta fixa"
            onClick={async () => {
              const ok = await confirm({
                title: "Arquivar conta fixa",
                description: `Arquivar "${bill.name}"? Ela para de gerar novas ocorrências, mas o histórico é mantido.`,
                confirmLabel: "Arquivar",
                destructive: true,
              });
              if (ok) changeStatus.mutate({ billId: bill.id, status: "archived" });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <AppShell
      activeSection="planejamento"
      title="Planejamento"
      subtitle="Contas fixas e calendário de pagamentos"
    >
      <PlanejamentoTabs value="contas-fixas" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-emerald-700" />
            Próximos vencimentos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Contas com vencimento nos próximos {CALENDAR_WINDOW_DAYS} dias.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcomingItems.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhum vencimento nos próximos {CALENDAR_WINDOW_DAYS} dias.
            </p>
          ) : (
            upcomingItems.map((occurrence) => {
              const state = billOccurrenceState(occurrence);
              return (
                <div
                  key={occurrence.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="truncate">{occurrence.bill_name}</strong>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0",
                          state.tone === "good" &&
                            "border-emerald-200 bg-emerald-50 text-emerald-700",
                          state.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
                          state.tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600",
                        )}
                      >
                        {state.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(occurrence.due_date).toLocaleDateString("pt-BR")}
                      {occurrence.category_name ? ` · ${occurrence.category_name}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <strong>{formatCurrency(occurrence.expected_amount)}</strong>
                    {occurrence.status === "pending" ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openPay(occurrence)}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          Marcar paga
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => skipMutation.mutate(occurrence.id)}
                        >
                          <SkipForward className="mr-1 h-3 w-3" />
                          Pular
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => reopenMutation.mutate(occurrence.id)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Reabrir
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Contas fixas cadastradas</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
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
              <ToggleGroupItem value="calendar" aria-label="Ver como calendário">
                <CalendarDays className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
            <Button type="button" onClick={openCreate}>
              <Repeat className="mr-2 h-4 w-4" />
              Nova conta fixa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma conta fixa cadastrada ainda. Cadastre escola, condomínio, luz, seguro e outras
              despesas recorrentes para acompanhar o vencimento delas aqui.
            </p>
          ) : viewMode === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {bills.map((bill) => {
                const category = categories.find((c) => c.id === bill.category_id);
                const account = accounts.find((a) => a.account_key === bill.account_id);
                const next = nextOccurrenceByBill.get(bill.id);
                const nextState = next ? billOccurrenceState(next) : null;
                return (
                  <div
                    key={bill.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong className="leading-tight">{bill.name}</strong>
                        <p className="text-xs text-muted-foreground">
                          {category?.name ?? "Sem categoria"}
                          {account ? ` · ${account.name}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={billStatusBadgeClass(bill.status)}>
                        {recurringBillStatusLabel[bill.status]}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {bill.amount_is_variable ? "Valor médio" : "Valor esperado"}
                      </span>
                      <strong>{formatCurrency(bill.expected_amount)}</strong>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Vence dia {bill.due_day} ·{" "}
                      {recurrenceFrequencyLabel[bill.recurrence_frequency]}
                    </p>

                    {next && nextState ? (
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs">
                        <span>{new Date(next.due_date).toLocaleDateString("pt-BR")}</span>
                        <Badge variant="outline" className={occurrenceBadgeClass(nextState.tone)}>
                          {nextState.label}
                        </Badge>
                      </div>
                    ) : null}

                    <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
                      {renderBillActions(bill)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === "list" ? (
            <div className="space-y-2">
              {bills.map((bill) => {
                const category = categories.find((c) => c.id === bill.category_id);
                const account = accounts.find((a) => a.account_key === bill.account_id);
                const next = nextOccurrenceByBill.get(bill.id);
                const nextState = next ? billOccurrenceState(next) : null;
                return (
                  <div
                    key={bill.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="truncate">{bill.name}</strong>
                        <Badge variant="outline" className={billStatusBadgeClass(bill.status)}>
                          {recurringBillStatusLabel[bill.status]}
                        </Badge>
                        {next && nextState ? (
                          <Badge variant="outline" className={occurrenceBadgeClass(nextState.tone)}>
                            {nextState.label}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {category?.name ?? "Sem categoria"}
                        {account ? ` · ${account.name}` : ""} · Vence dia {bill.due_day} ·{" "}
                        {recurrenceFrequencyLabel[bill.recurrence_frequency]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <strong>{formatCurrency(bill.expected_amount)}</strong>
                      <div className="flex items-center gap-1">{renderBillActions(bill)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!canGoPrevMonth}
                  aria-label="Mês anterior"
                  onClick={() => shiftCalendarMonth(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <strong className="text-sm capitalize">
                  {calendarMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </strong>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!canGoNextMonth}
                  aria-label="Próximo mês"
                  onClick={() => shiftCalendarMonth(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                {WEEKDAY_LABELS.map((label, index) => (
                  <div key={index}>{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGrid(calendarMonth)
                  .flat()
                  .map((date) => {
                    const key = dateKey(date);
                    const inMonth = date.getMonth() === calendarMonth.getMonth();
                    const dayOccurrences = occurrencesByDay.get(key) ?? [];
                    const isToday = key === today();
                    return (
                      <div
                        key={key}
                        className={cn(
                          "min-h-[64px] rounded-md border p-1 text-xs",
                          inMonth ? "border-slate-200 bg-white" : "border-transparent bg-slate-50",
                          isToday && "ring-1 ring-emerald-500",
                        )}
                      >
                        <span className={cn(inMonth ? "text-slate-500" : "text-slate-300")}>
                          {date.getDate()}
                        </span>
                        <div className="mt-0.5 space-y-0.5">
                          {dayOccurrences.slice(0, 3).map((occurrence) => {
                            const state = billOccurrenceState(occurrence);
                            return (
                              <button
                                key={occurrence.id}
                                type="button"
                                title={`${occurrence.bill_name} · ${formatCurrency(occurrence.expected_amount)}`}
                                onClick={() =>
                                  occurrence.status === "pending" && openPay(occurrence)
                                }
                                className={cn(
                                  "block w-full truncate rounded px-1 py-0.5 text-left text-[10px]",
                                  state.tone === "good" && "bg-emerald-100 text-emerald-800",
                                  state.tone === "warning" && "bg-amber-100 text-amber-800",
                                  state.tone === "neutral" && "bg-slate-100 text-slate-700",
                                )}
                              >
                                {occurrence.bill_name}
                              </button>
                            );
                          })}
                          {dayOccurrences.length > 3 ? (
                            <p className="text-[10px] text-muted-foreground">
                              +{dayOccurrences.length - 3}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criar/editar conta fixa */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBill ? "Editar conta fixa" : "Nova conta fixa"}</DialogTitle>
            <DialogDescription>
              Despesas recorrentes com vencimento, como escola, condomínio, luz ou seguro.
            </DialogDescription>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria (opcional)</Label>
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
              <div>
                <Label>Conta ou cartão (opcional)</Label>
                <Select
                  value={form.accountId}
                  onValueChange={(value) => setForm({ ...form, accountId: value })}
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor esperado</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.expectedAmount}
                  onChange={(event) => setForm({ ...form, expectedAmount: event.target.value })}
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <Checkbox
                    checked={form.amountIsVariable}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, amountIsVariable: checked === true })
                    }
                  />
                  Valor variável (ex: luz, água)
                </label>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Periodicidade</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(value) =>
                    setForm({ ...form, frequency: value as RecurringBillFrequency })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{recurrenceFrequencyLabel.monthly}</SelectItem>
                    <SelectItem value="yearly">{recurrenceFrequencyLabel.yearly}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dia do vencimento</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.dueDay}
                  onChange={(event) => setForm({ ...form, dueDay: event.target.value })}
                />
              </div>
              <div>
                <Label>Lembrar (dias antes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.reminderDaysBefore}
                  onChange={(event) => setForm({ ...form, reminderDaysBefore: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data inicial</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                />
              </div>
              <div>
                <Label>Duração (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Indefinido"
                  value={form.projectionMonths}
                  onChange={(event) => setForm({ ...form, projectionMonths: event.target.value })}
                />
              </div>
              <div>
                <Label>Se cair no fim de semana</Label>
                <Select
                  value={form.dueDateAdjustment}
                  onValueChange={(value) =>
                    setForm({ ...form, dueDateAdjustment: value as RecurringBillDueDateAdjustment })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="previous_business_day">
                      {dueDateAdjustmentLabel.previous_business_day}
                    </SelectItem>
                    <SelectItem value="next_business_day">
                      {dueDateAdjustmentLabel.next_business_day}
                    </SelectItem>
                    <SelectItem value="none">{dueDateAdjustmentLabel.none}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => saveBill.mutate()}
              disabled={!form.name || !form.expectedAmount || !form.dueDay || saveBill.isPending}
            >
              {editingBill ? "Salvar alterações" : "Criar conta fixa"}
            </Button>
          </DialogFooter>
          {saveBill.error ? (
            <p className="text-sm text-red-700">
              {saveBill.error instanceof Error ? saveBill.error.message : String(saveBill.error)}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Marcar ocorrência como paga */}
      <Dialog open={!!payOccurrence} onOpenChange={(open) => !open && setPayOccurrence(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como paga</DialogTitle>
            <DialogDescription>{payOccurrence?.bill_name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor pago</Label>
                <Input
                  type="number"
                  step="0.01"
                  autoFocus
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(event.target.value)}
                />
              </div>
              <div>
                <Label>Data do pagamento</Label>
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Vincular a um lançamento existente (opcional)</Label>
              <Select value={linkedTransactionId} onValueChange={setLinkedTransactionId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum — baixa manual</SelectItem>
                  {payOccurrence
                    ? candidateTransactions(payOccurrence).map((transaction) => (
                        <SelectItem key={transaction.id} value={transaction.id}>
                          {new Date(transaction.posted_at).toLocaleDateString("pt-BR")} ·{" "}
                          {transaction.description} · {formatCurrency(Number(transaction.amount))}
                        </SelectItem>
                      ))
                    : null}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Vincular evita duplicar o lançamento: a baixa passa a apontar para a transação que
                já existe, em vez de criar um registro novo.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPayOccurrence(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => payMutation.mutate()}
              disabled={!paidAmount || payMutation.isPending}
            >
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
