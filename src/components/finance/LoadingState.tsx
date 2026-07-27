import { Skeleton } from "@/components/ui/skeleton";

/** Loading padrão — substitui o "Carregando…" em texto puro repetido em
 *  cada tela por um placeholder que já sugere a forma do conteúdo final. */
export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
