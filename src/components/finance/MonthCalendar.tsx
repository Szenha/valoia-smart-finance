import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

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

/** "YYYY-MM-DD" a partir de um Date local — mesma chave usada pra indexar
 *  itemsByDay, então nunca deve passar por conversão de fuso (ver
 *  src/lib/finance/date-utils.ts). */
export function monthCalendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type Props<T> = {
  /** Mês exibido — sempre um Date LOCAL (ex: startOfCurrentLocalMonth()),
   *  nunca resultado de `new Date(dateOnlyString)`. */
  month: Date;
  onShiftMonth: (delta: number) => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  /** Itens agrupados por dia, chaveados por monthCalendarDayKey. */
  itemsByDay: Map<string, T[]>;
  renderItem: (item: T, dayKey: string) => ReactNode;
  getItemKey: (item: T) => string;
  todayKey?: string;
  maxVisiblePerDay?: number;
  /** Abaixo do breakpoint `sm`, esconde a lista de itens (texto minúsculo
   *  demais pra caber numa célula em mobile) e mostra só pontinhos
   *  coloridos + contador — a partir de `sm`, mantém o grid completo. */
  mobileCompact?: boolean;
  /** Cor de cada pontinho no modo compacto — obrigatório quando
   *  mobileCompact é true. */
  dotColorForItem?: (item: T) => string;
  /** Clique no dia inteiro (não só num item) — usado no mobile pra abrir a
   *  agenda do dia selecionado fora da grade. */
  onSelectDay?: (dayKey: string) => void;
  selectedDayKey?: string;
};

/** Grid mensal genérico — usado tanto por Contas fixas (só contas) quanto
 *  pelo Calendário (contas somente-leitura + compromissos), cada um
 *  passando seu próprio tipo de item e como renderizá-lo. */
export function MonthCalendar<T>({
  month,
  onShiftMonth,
  canGoPrev,
  canGoNext,
  itemsByDay,
  renderItem,
  getItemKey,
  todayKey,
  maxVisiblePerDay = 3,
  mobileCompact,
  dotColorForItem,
  onSelectDay,
  selectedDayKey,
}: Props<T>) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canGoPrev}
          aria-label="Mês anterior"
          onClick={() => onShiftMonth(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <strong className="text-sm capitalize">
          {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </strong>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canGoNext}
          aria-label="Próximo mês"
          onClick={() => onShiftMonth(1)}
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
        {monthGrid(month)
          .flat()
          .map((date) => {
            const key = monthCalendarDayKey(date);
            const inMonth = date.getMonth() === month.getMonth();
            const dayItems = itemsByDay.get(key) ?? [];
            const isToday = todayKey != null && key === todayKey;
            const isSelected = !isToday && selectedDayKey != null && key === selectedDayKey;
            const dots = dayItems.slice(0, 3);
            return (
              <div
                key={key}
                role={onSelectDay ? "button" : undefined}
                tabIndex={onSelectDay ? 0 : undefined}
                onClick={onSelectDay ? () => onSelectDay(key) : undefined}
                onKeyDown={
                  onSelectDay
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectDay(key);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "rounded-md border p-1 text-xs",
                  mobileCompact ? "min-h-[40px] sm:min-h-[64px]" : "min-h-[64px]",
                  inMonth ? "border-slate-200 bg-white" : "border-transparent bg-slate-50",
                  isToday && "ring-1 ring-emerald-500",
                  isSelected && "ring-1 ring-primary",
                  onSelectDay && "cursor-pointer",
                )}
              >
                <span className={cn(inMonth ? "text-slate-500" : "text-slate-300")}>
                  {date.getDate()}
                </span>
                {mobileCompact ? (
                  <div className="mt-1 flex flex-wrap items-center gap-0.5 sm:hidden">
                    {dots.map((item) => (
                      <span
                        key={getItemKey(item)}
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: dotColorForItem?.(item) ?? "#64748b" }}
                      />
                    ))}
                    {dayItems.length > dots.length ? (
                      <span className="text-[9px] leading-none text-slate-400">
                        +{dayItems.length - dots.length}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className={cn("mt-0.5 space-y-0.5", mobileCompact && "hidden sm:block")}>
                  {dayItems.slice(0, maxVisiblePerDay).map((item) => (
                    <div key={getItemKey(item)} onClick={(event) => event.stopPropagation()}>
                      {renderItem(item, key)}
                    </div>
                  ))}
                  {dayItems.length > maxVisiblePerDay ? (
                    <p className="text-[10px] text-muted-foreground">
                      +{dayItems.length - maxVisiblePerDay}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
