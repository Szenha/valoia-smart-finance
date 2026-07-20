import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { CalendarEventDialog } from "@/components/finance/CalendarEventDialog";
import { FamilyMembersDialog } from "@/components/finance/FamilyMembersDialog";
import { MonthCalendar, monthCalendarDayKey } from "@/components/finance/MonthCalendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoryIconFor } from "@/lib/finance/category-icons";
import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  localToday,
  startOfCurrentLocalMonth,
  startOfMonthDateOnly,
} from "@/lib/finance/date-utils";
import {
  ensureRecurringBillOccurrences,
  fetchCalendarEvents,
  fetchCalendarEventsUpcoming,
  fetchFamilyMembers,
  fetchRecurringBillsUpcoming,
} from "@/lib/finance/data";
import { eventIconFor } from "@/lib/finance/event-icons";
import type { CalendarEventOccurrence, CalendarEventRow } from "@/lib/finance/types";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendario")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Calendário" }] }),
  component: CalendarioRoute,
});

const VIEW_MODE_KEY = "calcum:calendario-view";
const WEEKDAY_FULL_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type ViewMode = "month" | "week" | "day";

const BILL_FALLBACK_COLOR = "#64748b";

type CalendarItem =
  | {
      kind: "bill";
      key: string;
      sortKey: string;
      billName: string;
      amount: number;
      categoryIcon: string | null;
      categoryColor: string | null;
    }
  | { kind: "event"; key: string; sortKey: string; occurrence: CalendarEventOccurrence };

function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${day}/${month}`;
}

function CalendarioRoute() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const { orgId } = useActiveOrganization(currentUserId);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [viewDate, setViewDate] = useState(() => startOfCurrentLocalMonth());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "month" || stored === "week" || stored === "day") {
      setViewMode(stored);
      // Trocar de visão sempre parte do "agora" — mês vigente pra Mês,
      // semana/dia atuais pra Semana/Dia — nunca fica preso em qualquer
      // navegação que tivesse acontecido numa visão anterior.
      setViewDate(stored === "month" ? startOfCurrentLocalMonth() : new Date());
    }
  }, []);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
    setViewDate(mode === "month" ? startOfCurrentLocalMonth() : new Date());
  }
  function shiftView(delta: number) {
    setViewDate((current) => {
      if (viewMode === "month")
        return new Date(current.getFullYear(), current.getMonth() + delta, 1);
      if (viewMode === "week") {
        const next = new Date(current);
        next.setDate(current.getDate() + delta * 7);
        return next;
      }
      const next = new Date(current);
      next.setDate(current.getDate() + delta);
      return next;
    });
  }
  function goToToday() {
    setViewDate(viewMode === "month" ? startOfCurrentLocalMonth() : new Date());
  }

  const [selectedMemberId, setSelectedMemberId] = useState("all");

  const viewDateKey = monthCalendarDayKey(viewDate);
  const monthKey = startOfMonthDateOnly(viewDateKey);
  const weekStartKey = addDaysToDateOnly(viewDateKey, -viewDate.getDay());
  const weekEndKey = addDaysToDateOnly(weekStartKey, 6);

  // Janela de busca cobre exatamente o que a visão ativa precisa: mês exibido
  // (+ folga de 7 dias pros dias de mês vizinho no grid), semana ou dia único.
  const windowStart =
    viewMode === "month"
      ? addDaysToDateOnly(monthKey, -7)
      : viewMode === "week"
        ? weekStartKey
        : viewDateKey;
  const windowEnd =
    viewMode === "month"
      ? addDaysToDateOnly(addMonthsToDateOnly(monthKey, 1), 7)
      : viewMode === "week"
        ? weekEndKey
        : viewDateKey;

  const familyMembersQuery = useQuery({
    queryKey: ["family-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchFamilyMembers(orgId!),
  });

  const eventsQuery = useQuery({
    queryKey: ["calendar-events", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCalendarEvents(orgId!),
  });
  const occurrencesQuery = useQuery({
    queryKey: ["calendar-events-upcoming", orgId, windowStart, windowEnd],
    enabled: !!orgId,
    queryFn: () => fetchCalendarEventsUpcoming(orgId!, windowStart, windowEnd),
  });
  // Contas fixas aparecem no calendário só como leitura — vêm de
  // Planejamento > Contas Fixas, não editáveis aqui.
  const billOccurrencesQuery = useQuery({
    queryKey: ["calendar-bill-occurrences", orgId, windowStart, windowEnd],
    enabled: !!orgId,
    queryFn: async () => {
      await ensureRecurringBillOccurrences(orgId!, windowEnd);
      return fetchRecurringBillsUpcoming(orgId!, windowStart, windowEnd);
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRow | null>(null);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);

  function openCreate() {
    setEditingEvent(null);
    setDialogOpen(true);
  }

  function openEditByOccurrence(occurrence: CalendarEventOccurrence) {
    const event = (eventsQuery.data ?? []).find((e) => e.id === occurrence.event_id);
    if (!event) return;
    setEditingEvent(event);
    setDialogOpen(true);
  }

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  const familyMembers = familyMembersQuery.data ?? [];
  const familyMemberById = new Map(familyMembers.map((m) => [m.id, m]));

  const itemsByDay = new Map<string, CalendarItem[]>();
  for (const occurrence of billOccurrencesQuery.data ?? []) {
    const list = itemsByDay.get(occurrence.due_date) ?? [];
    list.push({
      kind: "bill",
      key: `bill-${occurrence.id}`,
      sortKey: "",
      billName: occurrence.bill_name,
      amount: occurrence.expected_amount,
      categoryIcon: occurrence.category_icon,
      categoryColor: occurrence.category_color,
    });
    itemsByDay.set(occurrence.due_date, list);
  }
  for (const occurrence of occurrencesQuery.data ?? []) {
    if (selectedMemberId !== "all" && occurrence.family_member_id !== selectedMemberId) continue;
    const list = itemsByDay.get(occurrence.occurrence_date) ?? [];
    list.push({
      kind: "event",
      key: `event-${occurrence.event_id}-${occurrence.occurrence_date}`,
      sortKey: occurrence.start_time ?? "",
      occurrence,
    });
    itemsByDay.set(occurrence.occurrence_date, list);
  }
  for (const [day, items] of itemsByDay) itemsByDay.set(day, sortItems(items));

  const earliestView = startOfMonthDateOnly(addMonthsToDateOnly(localToday(), -24));
  const latestView = startOfMonthDateOnly(addMonthsToDateOnly(localToday(), 24));
  const canGoPrev = windowStart > earliestView;
  const canGoNext = windowEnd < latestView;

  function renderItem(item: CalendarItem) {
    if (item.kind === "bill") {
      const billColor = item.categoryColor ?? BILL_FALLBACK_COLOR;
      const BillIcon = categoryIconFor(item.categoryIcon, "expense");
      return (
        <span
          title={`${item.billName} (conta fixa)`}
          style={{ backgroundColor: `${billColor}1f`, color: billColor }}
          className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium"
        >
          <BillIcon className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{item.billName}</span>
        </span>
      );
    }
    const occurrence = item.occurrence;
    const member = occurrence.family_member_id
      ? familyMemberById.get(occurrence.family_member_id)
      : null;
    const memberColor = member?.color ?? occurrence.color ?? "#64748b";
    const EventIcon = eventIconFor(occurrence.icon);
    const time = occurrence.start_time ? occurrence.start_time.slice(0, 5) : "";
    return (
      <button
        type="button"
        title={`${occurrence.title}${member ? ` · ${member.name}` : ""}${time ? ` · ${time}` : ""}`}
        onClick={() => openEditByOccurrence(occurrence)}
        style={{ backgroundColor: `${memberColor}1f`, color: memberColor }}
        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium"
      >
        <EventIcon className="h-2.5 w-2.5 shrink-0" />
        {time ? <span className="shrink-0 tabular-nums">{time}</span> : null}
        <span className="truncate">{occurrence.title}</span>
      </button>
    );
  }

  function renderDayAgenda(dayKey: string, label: string) {
    const items = itemsByDay.get(dayKey) ?? [];
    return (
      <div key={dayKey} className="space-y-1.5">
        <p
          className={cn(
            "text-xs font-semibold",
            dayKey === localToday() ? "text-emerald-700" : "text-slate-500",
          )}
        >
          {label}
        </p>
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 p-2 text-xs text-muted-foreground">
            Nada por aqui.
          </p>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div key={item.key}>{renderItem(item)}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const headerLabel =
    viewMode === "month"
      ? viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : viewMode === "week"
        ? `${shortDate(weekStartKey)} – ${shortDate(weekEndKey)}`
        : `${WEEKDAY_FULL_LABELS[viewDate.getDay()]}, ${shortDate(viewDateKey)}`;

  return (
    <AppShell
      activeSection="calendario"
      title="Calendário"
      subtitle="Contas a pagar e compromissos do grupo, no mesmo lugar"
    >
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-emerald-700" />
            Calendário do grupo
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setMembersDialogOpen(true)}>
              <Users className="mr-2 h-4 w-4" />
              Membros do grupo
            </Button>
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo compromisso
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {familyMembers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2.5 text-xs">
              <span className="font-medium text-slate-500">Legenda:</span>
              {familyMembers.map((member) => (
                <span key={member.id} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: member.color }}
                  />
                  {member.name}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canGoPrev}
                aria-label="Anterior"
                onClick={() => shiftView(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <strong className="min-w-[160px] text-center text-sm capitalize">
                {headerLabel}
              </strong>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canGoNext}
                aria-label="Próximo"
                onClick={() => shiftView(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={goToToday}>
                Hoje
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os membros</SelectItem>
                  {familyMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup
                type="single"
                variant="outline"
                value={viewMode}
                onValueChange={(value) => value && changeViewMode(value as ViewMode)}
              >
                <ToggleGroupItem value="month">Mês</ToggleGroupItem>
                <ToggleGroupItem value="week">Semana</ToggleGroupItem>
                <ToggleGroupItem value="day">Dia</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {viewMode === "month" ? (
            <MonthCalendar
              month={viewDate}
              onShiftMonth={shiftView}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              itemsByDay={itemsByDay}
              getItemKey={(item) => item.key}
              todayKey={localToday()}
              maxVisiblePerDay={4}
              renderItem={renderItem}
            />
          ) : viewMode === "week" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {Array.from({ length: 7 }, (_, index) => {
                const dayKey = addDaysToDateOnly(weekStartKey, index);
                return renderDayAgenda(
                  dayKey,
                  `${WEEKDAY_FULL_LABELS[index]} · ${shortDate(dayKey)}`,
                );
              })}
            </div>
          ) : (
            renderDayAgenda(viewDateKey, headerLabel)
          )}
        </CardContent>
      </Card>

      <CalendarEventDialog
        orgId={orgId}
        userId={currentUserId}
        familyMembers={familyMembers}
        today={localToday()}
        editingEvent={editingEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <FamilyMembersDialog
        orgId={orgId}
        familyMembers={familyMembers}
        open={membersDialogOpen}
        onOpenChange={setMembersDialogOpen}
      />
    </AppShell>
  );
}
