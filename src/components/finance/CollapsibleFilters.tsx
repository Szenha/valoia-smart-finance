import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  /** Chave de localStorage — única por tela, para lembrar a preferência
   *  entre visitas (mesmo padrão de AppShell/sidebar e Contas fixas/view). */
  storageKey: string;
  children: ReactNode;
  /** Avisa a tela pai quando o estado muda — usado em Transações para
   *  recolher também o bloco do microfone junto com os filtros. */
  onCollapsedChange?: (collapsed: boolean) => void;
};

export function CollapsibleFilters({ storageKey, children, onCollapsedChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey) === "1";
    if (stored) {
      setCollapsed(true);
      onCollapsedChange?.(true);
    }
    // Só na montagem — ler a preferência salva uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(storageKey, next ? "1" : "0");
      onCollapsedChange?.(next);
      return next;
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5 text-muted-foreground"
        onClick={toggle}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </Button>
      {!collapsed ? children : null}
    </div>
  );
}
