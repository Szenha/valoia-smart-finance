import { ChevronRight } from "lucide-react";
import type { CategoryBreadcrumbStep } from "@/lib/finance/category-drilldown";
import { cn } from "@/lib/utils";

type Props = {
  path: CategoryBreadcrumbStep[];
  onRoot: () => void;
  onStep: (index: number) => void;
};

/** "Todas > Casa > Funcionárias" — cada segmento clicável pra voltar
 *  (drill-up) até aquele nível; usado junto com useCategoryDrilldown. */
export function CategoryBreadcrumb({ path, onRoot, onStep }: Props) {
  if (path.length === 0) {
    return <p className="text-xs font-medium text-muted-foreground">Todas as categorias</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <button
        type="button"
        onClick={onRoot}
        className="font-medium text-muted-foreground hover:text-emerald-700 hover:underline"
      >
        Todas
      </button>
      {path.map((step, index) => {
        const isLast = index === path.length - 1;
        return (
          <span key={step.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              type="button"
              disabled={isLast}
              onClick={() => onStep(index)}
              className={cn(
                "font-medium hover:underline",
                isLast
                  ? "cursor-default text-slate-900"
                  : "text-muted-foreground hover:text-emerald-700",
              )}
            >
              {step.name}
            </button>
          </span>
        );
      })}
    </div>
  );
}
