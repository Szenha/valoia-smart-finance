import { Button } from "@/components/ui/button";

interface WorkspaceGateProps {
  error: Error | null;
  onRetry: () => void;
  fullScreen?: boolean;
}

// Renderizado no lugar da página enquanto orgId ainda não resolveu — ou,
// se organizationsQuery falhou (ex: policy de RLS), no lugar de um
// "Carregando…" que nunca terminaria.
export function WorkspaceGate({ error, onRetry, fullScreen }: WorkspaceGateProps) {
  const containerClass = fullScreen
    ? "flex min-h-screen items-center justify-center p-5"
    : "flex items-center justify-center p-5";

  if (error) {
    return (
      <div className={containerClass}>
        <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
          <p>Não foi possível carregar seu workspace.</p>
          <p className="text-sm">{error.message}</p>
          <Button variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return <div className={`${containerClass} text-muted-foreground`}>Carregando…</div>;
}
