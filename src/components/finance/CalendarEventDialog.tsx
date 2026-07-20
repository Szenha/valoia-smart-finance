import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconPicker } from "@/components/finance/IconPicker";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CalendarEventInput,
} from "@/lib/finance/data";
import { EVENT_ICON_OPTIONS } from "@/lib/finance/event-icons";
import type { CalendarEventRow, FamilyMemberRow } from "@/lib/finance/types";

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

type FormState = {
  familyMemberId: string;
  title: string;
  icon: string;
  notes: string;
  recurrence: CalendarEventRow["recurrence"];
  eventDate: string;
  weekday: number;
  startTime: string;
  endTime: string;
  seriesStartDate: string;
  seriesEndDate: string;
};

function emptyForm(defaultMemberId: string, today: string): FormState {
  return {
    familyMemberId: defaultMemberId,
    title: "",
    icon: "",
    notes: "",
    recurrence: "weekly",
    eventDate: today,
    weekday: new Date().getDay(),
    startTime: "15:00",
    endTime: "",
    seriesStartDate: today,
    seriesEndDate: "",
  };
}

function formFromEvent(event: CalendarEventRow): FormState {
  return {
    familyMemberId: event.family_member_id ?? "",
    title: event.title,
    icon: event.icon ?? "",
    notes: event.notes ?? "",
    recurrence: event.recurrence,
    eventDate: event.event_date ?? "",
    weekday: event.weekday ?? new Date().getDay(),
    startTime: event.start_time?.slice(0, 5) ?? "",
    endTime: event.end_time?.slice(0, 5) ?? "",
    seriesStartDate: event.series_start_date,
    seriesEndDate: event.series_end_date ?? "",
  };
}

type Props = {
  orgId: string;
  /** Só pra auditoria (created_by) — quem estava logado ao criar, não tem
   *  relação com de qual family_member é o compromisso. */
  userId: string | null;
  familyMembers: FamilyMemberRow[];
  today: string;
  /** null = criar novo evento; um CalendarEventRow = editar existente. */
  editingEvent: CalendarEventRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CalendarEventDialog({
  orgId,
  userId,
  familyMembers,
  today,
  editingEvent,
  open,
  onOpenChange,
}: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(() =>
    editingEvent ? formFromEvent(editingEvent) : emptyForm(familyMembers[0]?.id ?? "", today),
  );

  useEffect(() => {
    if (!open) return;
    setForm(
      editingEvent ? formFromEvent(editingEvent) : emptyForm(familyMembers[0]?.id ?? "", today),
    );
  }, [open, editingEvent, familyMembers, today]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Dê um nome ao compromisso.");
      if (!form.familyMemberId) throw new Error("Selecione a quem o compromisso pertence.");
      if (form.recurrence === "once" && !form.eventDate) {
        throw new Error("Selecione a data do compromisso.");
      }
      const input: CalendarEventInput = {
        family_member_id: form.familyMemberId,
        title: form.title.trim(),
        icon: form.icon || null,
        notes: form.notes || null,
        recurrence: form.recurrence,
        event_date: form.recurrence === "once" ? form.eventDate : null,
        weekday: form.recurrence === "weekly" ? form.weekday : null,
        start_time: form.startTime || null,
        end_time: form.endTime || null,
        series_start_date: form.seriesStartDate,
        series_end_date: form.recurrence === "weekly" ? form.seriesEndDate || null : null,
      };
      if (editingEvent) await updateCalendarEvent(editingEvent.id, input);
      else await createCalendarEvent(orgId, userId, input);
    },
    onSuccess: async () => {
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["calendar-events", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["calendar-events-upcoming", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-upcoming-events", orgId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editingEvent) return;
      const ok = await confirm({
        title: "Excluir compromisso",
        description:
          form.recurrence === "weekly"
            ? `Excluir "${editingEvent.title}"? Isso remove a série toda, não só uma ocorrência.`
            : `Excluir "${editingEvent.title}"?`,
        confirmLabel: "Excluir",
        destructive: true,
      });
      if (!ok) return;
      await deleteCalendarEvent(editingEvent.id);
    },
    onSuccess: async () => {
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["calendar-events", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["calendar-events-upcoming", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-upcoming-events", orgId] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingEvent ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nome</Label>
            <Input
              autoFocus
              placeholder="Ex: Jazz, Futebol, Consulta médica"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>

          <div>
            <Label>De quem é</Label>
            <Select
              value={form.familyMemberId}
              onValueChange={(value) => setForm({ ...form, familyMemberId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um membro do grupo" />
              </SelectTrigger>
              <SelectContent>
                {familyMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <span className="flex items-center gap-2">
                      <MemberAvatar name={member.name} color={member.color} size="sm" />
                      {member.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {familyMembers.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum membro do grupo cadastrado ainda — cadastre um em "Membros do grupo" na tela
                do Calendário antes de criar o compromisso.
              </p>
            ) : null}
          </div>

          <IconPicker
            value={form.icon}
            onChange={(icon) => setForm({ ...form, icon })}
            options={EVENT_ICON_OPTIONS}
          />

          <div>
            <Label>Repetição</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={form.recurrence}
              onValueChange={(value) =>
                value && setForm({ ...form, recurrence: value as CalendarEventRow["recurrence"] })
              }
              className="mt-1 justify-start"
            >
              <ToggleGroupItem value="weekly">Toda semana</ToggleGroupItem>
              <ToggleGroupItem value="once">Data única</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {form.recurrence === "weekly" ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Dia da semana</Label>
                <Select
                  value={String(form.weekday)}
                  onValueChange={(value) => setForm({ ...form, weekday: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                />
              </div>
              <div>
                <Label>Até quando (opcional)</Label>
                <Input
                  type="date"
                  value={form.seriesEndDate}
                  onChange={(event) => setForm({ ...form, seriesEndDate: event.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={form.eventDate}
                  onChange={(event) => setForm({ ...form, eventDate: event.target.value })}
                />
              </div>
              <div>
                <Label>Horário (opcional)</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                />
              </div>
            </div>
          )}

          <div>
            <Label>Notas (opcional)</Label>
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter className="flex items-center sm:justify-between">
          {editingEvent ? (
            <Button
              type="button"
              variant="ghost"
              className="text-red-600 hover:text-red-700"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {editingEvent ? "Salvar alterações" : "Criar compromisso"}
            </Button>
          </div>
        </DialogFooter>
        {saveMutation.error ? (
          <p className="text-sm text-red-700">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : String(saveMutation.error)}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
