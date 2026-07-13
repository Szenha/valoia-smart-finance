import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/finance/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/planejamento")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  component: PlanningRoute,
});

function PlanningRoute() {
  return (
    <AppShell
      activeSection="planejamento"
      title="Planejamento"
      subtitle="Orçado vs realizado por categoria"
    >
      <Card>
        <CardHeader>
          <CardTitle>Planejamento familiar</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          O módulo de orçado vs realizado será implementado na Frente 3.
        </CardContent>
      </Card>
    </AppShell>
  );
}
