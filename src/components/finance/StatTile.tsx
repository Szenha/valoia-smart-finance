import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "income" | "expense" | "neutral";

const TONE_ICON = { income: TrendingUp, expense: TrendingDown, neutral: Minus } as const;
const TONE_CLASS = {
  income: "text-emerald-700",
  expense: "text-red-700",
  neutral: "text-muted-foreground",
} as const;

/** Cartão indicador neutro — número em destaque tipográfico (não em cor de
 *  fundo). `tone` é só um sinal semântico discreto (ícone + cor no próprio
 *  ícone), reservado pra receita/despesa/saldo — a maioria dos indicadores
 *  deve usar "neutral". Substitui a versão anterior com 4 fundos pastel e
 *  uma sparkline decorativa que não representava dado real. */
export function StatTile({
  label,
  value,
  tone = "neutral",
  compact,
}: {
  label: string;
  value: string;
  tone?: StatTone;
  /** Menor padding/tipografia — pra caber ao lado de controles de filtro
   *  em vez de ocupar uma seção inteira como no Dashboard. */
  compact?: boolean;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-card", compact ? "p-3" : "p-4")}>
      <div className="flex items-center gap-1.5">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {tone !== "neutral" ? (
          <Icon className={cn("h-3 w-3 shrink-0", TONE_CLASS[tone])} strokeWidth={2.5} />
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 truncate font-semibold leading-tight tabular-nums text-slate-950",
          compact ? "text-lg" : "text-lg lg:text-2xl",
        )}
      >
        {value}
      </p>
    </div>
  );
}
