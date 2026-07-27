import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Estado vazio padrão — ícone + frase curta + ação opcional, pra parar de
 *  cada tela reinventar seu próprio "Nenhum X encontrado" com markup e tom
 *  diferentes. Mantém o texto enxuto de propósito: orienta a próxima ação
 *  sem parágrafos explicativos. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-sm text-xs text-slate-500">{description}</p> : null}
      {action ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
