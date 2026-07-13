import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function AppNav({ onSignOut }: { onSignOut?: () => void }) {
  return (
    <nav className="flex flex-wrap items-center gap-2">
      <Button asChild variant="ghost">
        <Link to="/">Lançamentos</Link>
      </Button>
      <Button asChild variant="ghost">
        <Link to="/conciliacao">Extratos e conciliação</Link>
      </Button>
      <Button asChild variant="ghost">
        <Link to="/dashboard">Dashboard</Link>
      </Button>
      <Button asChild variant="ghost">
        <Link to="/reports">Relatórios</Link>
      </Button>
      <Button asChild variant="ghost">
        <Link to="/settings">Categorias e contas</Link>
      </Button>
      {onSignOut ? (
        <Button variant="outline" onClick={onSignOut}>
          Sair
        </Button>
      ) : null}
    </nav>
  );
}
