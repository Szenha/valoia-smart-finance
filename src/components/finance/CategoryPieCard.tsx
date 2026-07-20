import { ChevronRight } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBreadcrumb } from "@/components/finance/CategoryBreadcrumb";
import type { useCategoryDrilldown } from "@/lib/finance/category-drilldown";
import { formatCurrency } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

// Soft/pastel palette for the category donut, echoing the reference app's
// muted chart style — usada só como fallback quando a categoria não tem
// cor própria cadastrada.
const FALLBACK_COLORS = [
  "#94a3b8",
  "#6ee7b7",
  "#fda4af",
  "#93c5fd",
  "#fcd34d",
  "#7dd3c0",
  "#c4b5fd",
];

type Props = {
  title: string;
  drilldown: ReturnType<typeof useCategoryDrilldown>;
  emptyLabel: string;
  /** Erro da query que alimenta o drilldown, se houver — sem isso, uma RPC
   *  ausente/falhando fica indistinguível de "sem dados no período" (foi
   *  exatamente o que aconteceu com Receitas por categoria antes da
   *  migration incomes_by_category ser aplicada: chamada falhava e o card
   *  só mostrava "zero" em silêncio). */
  error?: unknown;
};

/** Card de pizza + legenda + breadcrumb, reaproveitado tanto pra "Despesas
 *  por categoria" quanto "Receitas por categoria" no Dashboard — cada
 *  balde já vem calculado no nível certo por useCategoryDrilldown; aqui só
 *  cuida da apresentação e dos cliques de drill-down/drill-up. Ícone de
 *  seta nos itens que dão pra detalhar deixa claro que são clicáveis. */
export function CategoryPieCard({ title, drilldown, emptyLabel, error }: Props) {
  const total = drilldown.buckets.reduce((sum, bucket) => sum + bucket.total, 0);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>{title}</CardTitle>
        <CategoryBreadcrumb
          path={drilldown.path}
          onRoot={drilldown.drillToRoot}
          onStep={drilldown.drillToStep}
        />
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            Não foi possível carregar: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : drilldown.buckets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            <div className="relative h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={drilldown.buckets}
                    dataKey="total"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    cursor="pointer"
                    onClick={(bucket) => drilldown.drillInto(bucket)}
                  >
                    {drilldown.buckets.map((bucket, index) => (
                      <Cell
                        key={bucket.categoryId ?? "none"}
                        fill={bucket.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <strong className="text-lg">{formatCurrency(total)}</strong>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {drilldown.buckets.map((bucket, index) => {
                const percent = total > 0 ? (bucket.total / total) * 100 : 0;
                const color = bucket.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
                return (
                  <button
                    type="button"
                    key={bucket.categoryId ?? "none"}
                    onClick={() => drilldown.drillInto(bucket)}
                    disabled={!bucket.drillable}
                    title={bucket.drillable ? `Ver subcategorias de ${bucket.name}` : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm",
                      bucket.drillable && "hover:bg-slate-50",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{bucket.name}</span>
                    <span className="shrink-0 text-muted-foreground">{percent.toFixed(0)}%</span>
                    <strong className="w-24 shrink-0 text-right">
                      {formatCurrency(bucket.total)}
                    </strong>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        bucket.drillable ? "text-slate-400" : "text-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
