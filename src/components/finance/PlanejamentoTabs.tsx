import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ROUTE_BY_TAB = {
  orcamento: "/planejamento/orcamento",
  metas: "/planejamento/metas",
} as const;

export function PlanejamentoTabs({ value }: { value: keyof typeof ROUTE_BY_TAB }) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={value}
      onValueChange={(next) => navigate({ to: ROUTE_BY_TAB[next as keyof typeof ROUTE_BY_TAB] })}
    >
      <TabsList>
        <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
        <TabsTrigger value="metas">Metas e objetivos</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
