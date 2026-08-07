import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

type Props = {
  /** Chave de localStorage — única por tela, para lembrar a preferência
   *  entre visitas (mesmo padrão de AppShell/sidebar e Contas fixas/view). */
  storageKey: string;
  /** Conjunto completo de filtros, usado tal qual no desktop (colapsa/expande
   *  inline, atrás do botão "Filtros"). */
  children: ReactNode;
  /** Avisa a tela pai quando o estado muda — usado em Transações para
   *  recolher também o bloco do microfone junto com os filtros. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Filtro sempre visível no mobile, ao lado do ícone de gaveta (o mais
   *  usado da tela) — opcional. Sem ele, o mobile mostra só o ícone (todos
   *  os filtros ficam dentro da gaveta), o que evita dropdowns ocupando a
   *  tela toda. Informe só quando um filtro específico realmente precisa
   *  ficar sempre à vista fora da gaveta. */
  mobilePrimary?: ReactNode;
  /** Filtros abertos numa gaveta (Drawer) no mobile a partir do ícone —
   *  quando informado (com ou sem mobilePrimary), o mobile para de empilhar
   *  todos os selects inline e passa a escondê-los atrás do ícone. */
  mobileAdvanced?: ReactNode;
  /** Quantos filtros avançados estão com um valor não-padrão — mostrado
   *  como contador no ícone da gaveta. */
  activeAdvancedCount?: number;
};

export function CollapsibleFilters({
  storageKey,
  children,
  onCollapsedChange,
  mobilePrimary,
  mobileAdvanced,
  activeAdvancedCount,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const hasMobileLayout = !!mobilePrimary || !!mobileAdvanced;

  const desktopBar = (
    <div className={`flex flex-wrap items-center gap-2 ${hasMobileLayout ? "hidden md:flex" : ""}`}>
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

  if (!hasMobileLayout) return desktopBar;

  return (
    <>
      {desktopBar}
      <div className="flex items-center gap-2 md:hidden">
        {mobilePrimary ? <div className="min-w-0 flex-1">{mobilePrimary}</div> : null}
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative shrink-0 text-muted-foreground"
              aria-label="Mais filtros"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeAdvancedCount ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {activeAdvancedCount}
                </span>
              ) : null}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Mais filtros</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-4 px-4 pb-4">{mobileAdvanced}</div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button type="button">Aplicar</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
