import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CategoryOption } from "@/lib/finance/categories";
import { categoryIconFor } from "@/lib/finance/category-icons";
import { categoryTypeLabel } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const TYPE_BADGE_CLASS: Record<string, string> = {
  income: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expense: "border-rose-200 bg-rose-50 text-rose-700",
  transfer: "border-slate-200 bg-slate-100 text-slate-600",
};

export function CategoryIconBadge({
  icon,
  type,
}: {
  icon: string | null | undefined;
  type: string;
}) {
  const Icon = categoryIconFor(icon, type);
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

type CategoryTreeProps = {
  nodes: CategoryOption[];
  expanded: Set<string>;
  onToggle: (categoryId: string) => void;
  /** Right-aligned slot per row — e.g. planned/realized amounts in Planejamento. */
  renderTrailing?: (node: CategoryOption) => ReactNode;
  /** Action buttons per row — e.g. editar/excluir, only shown in Cadastros. */
  renderActions?: (node: CategoryOption) => ReactNode;
  emptyMessage?: string;
};

export function CategoryTree({
  nodes,
  expanded,
  onToggle,
  renderTrailing,
  renderActions,
  emptyMessage = "Nenhuma categoria criada.",
}: CategoryTreeProps) {
  if (nodes.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div>
      {nodes.map((node) => (
        <CategoryTreeRow
          key={node.id}
          node={node}
          expanded={expanded}
          onToggle={onToggle}
          renderTrailing={renderTrailing}
          renderActions={renderActions}
        />
      ))}
    </div>
  );
}

function CategoryTreeRow({
  node,
  expanded,
  onToggle,
  renderTrailing,
  renderActions,
}: {
  node: CategoryOption;
  expanded: Set<string>;
  onToggle: (categoryId: string) => void;
  renderTrailing?: (node: CategoryOption) => ReactNode;
  renderActions?: (node: CategoryOption) => ReactNode;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isRoot = node.depth === 0;

  return (
    <div>
      <div
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={hasChildren ? () => onToggle(node.id) : undefined}
        onKeyDown={
          hasChildren
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggle(node.id);
                }
              }
            : undefined
        }
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-2 text-sm",
          hasChildren ? "cursor-pointer hover:bg-slate-50" : "hover:bg-slate-50/60",
        )}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <span className="h-7 w-7 shrink-0" />
        )}
        <CategoryIconBadge icon={node.icon} type={node.type} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate", isRoot ? "font-semibold" : "text-slate-600")}>{node.name}</p>
          {isRoot && hasChildren ? (
            <p className="truncate text-xs text-muted-foreground">
              {node.children.length} {node.children.length === 1 ? "subcategoria" : "subcategorias"}
            </p>
          ) : null}
        </div>
        {isRoot ? (
          <Badge
            variant="outline"
            className={cn("hidden shrink-0 sm:inline-flex", TYPE_BADGE_CLASS[node.type])}
          >
            {categoryTypeLabel[node.type] ?? node.type}
          </Badge>
        ) : null}
        {renderTrailing ? (
          <div onClick={(event) => event.stopPropagation()} className="shrink-0">
            {renderTrailing(node)}
          </div>
        ) : null}
        {renderActions ? (
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex shrink-0 items-center gap-1"
          >
            {renderActions(node)}
          </div>
        ) : null}
      </div>
      {hasChildren && isExpanded ? (
        <div className="ml-[22px] border-l border-slate-200 pl-3">
          {node.children.map((child) => (
            <CategoryTreeRow
              key={child.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              renderTrailing={renderTrailing}
              renderActions={renderActions}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
