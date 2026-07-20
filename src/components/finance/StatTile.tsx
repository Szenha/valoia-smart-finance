export type StatTheme = "green" | "coral" | "blue" | "amber";

const STAT_THEME: Record<StatTheme, { bg: string; label: string; value: string; spark: string }> = {
  green: {
    bg: "bg-emerald-50",
    label: "text-emerald-700",
    value: "text-emerald-900",
    spark: "#10b981",
  },
  coral: { bg: "bg-rose-50", label: "text-rose-700", value: "text-rose-900", spark: "#f43f5e" },
  blue: { bg: "bg-sky-50", label: "text-sky-700", value: "text-sky-900", spark: "#0284c7" },
  amber: { bg: "bg-amber-50", label: "text-amber-700", value: "text-amber-900", spark: "#d97706" },
};

// Purely decorative bump-curve, echoing the reference app's sparkline behind
// each metric card — not driven by real data.
function DecorativeSparkline({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full opacity-25"
    >
      <path
        d="M0,32 C15,32 20,10 35,10 C50,10 55,30 70,30 C85,30 90,4 120,4"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Card indicador estilo dashboard (fundo pastel + sparkline decorativa) —
 *  extraído do Dashboard pra ser reaproveitado em qualquer tela que precise
 *  de métricas rápidas em destaque (ex: resumo no topo de Transações). */
export function StatTile({
  label,
  value,
  theme,
  compact,
}: {
  label: string;
  value: string;
  theme: StatTheme;
  /** Menor padding/tipografia — pra caber ao lado de controles de filtro
   *  em vez de ocupar uma seção inteira como no Dashboard. */
  compact?: boolean;
}) {
  const { bg, label: labelClass, value: valueClass, spark } = STAT_THEME[theme];
  return (
    <div className={`relative overflow-hidden rounded-2xl ${compact ? "p-3" : "p-4"} ${bg}`}>
      <DecorativeSparkline color={spark} />
      <p
        className={`relative truncate text-[10px] font-semibold uppercase tracking-wide ${labelClass}`}
      >
        {label}
      </p>
      <p
        className={`relative mt-1 truncate font-bold leading-tight ${valueClass} ${
          compact ? "text-lg" : "text-lg lg:text-2xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
