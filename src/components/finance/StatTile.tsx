import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "income" | "expense" | "neutral";

const TONE_ICON = { income: TrendingUp, expense: TrendingDown, neutral: Minus } as const;
const TONE_CLASS = {
  income: "text-emerald-700",
  expense: "text-red-700",
  neutral: "text-muted-foreground",
} as const;
const TONE_ICON_BADGE_CLASS = {
  income: "bg-emerald-50 text-emerald-700",
  expense: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
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
  onClick,
  icon,
}: {
  label: string;
  value: string;
  tone?: StatTone;
  /** Menor padding/tipografia — pra caber ao lado de controles de filtro
   *  em vez de ocupar uma seção inteira como no Dashboard. */
  compact?: boolean;
  /** Quando informado, o tile vira um botão (drilldown) — ex: abrir os
   *  lançamentos que compõem esse número. */
  onClick?: () => void;
  /** Ícone à esquerda, num círculo colorido pelo tone — vira um layout
   *  horizontal (ícone + label/valor), pra um KPI pequeno e autoexplicativo
   *  fora de uma grade (ex: "Saldo consolidado" sozinho na página). Sem
   *  isso, mantém o layout vertical padrão usado nas grades de indicadores. */
  icon?: LucideIcon;
}) {
  const Icon = TONE_ICON[tone];
  const LeadingIcon = icon;
  const content = LeadingIcon ? (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          TONE_ICON_BADGE_CLASS[tone],
        )}
      >
        <LeadingIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-base font-semibold leading-tight tabular-nums text-slate-950">
          {value}
        </p>
      </div>
    </div>
  ) : (
    <>
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
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full rounded-2xl border border-slate-200 bg-card text-left transition-colors hover:bg-slate-50 active:bg-slate-100",
          compact ? "p-3" : "p-4",
        )}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-card", compact ? "p-3" : "p-4")}>
      {content}
    </div>
  );
}
