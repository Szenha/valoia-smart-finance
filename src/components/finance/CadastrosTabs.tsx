import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ROUTE_BY_TAB = {
  categorias: "/cadastros/categorias",
  contas: "/cadastros/contas-e-cartoes",
  membros: "/cadastros/membros",
} as const;

export function CadastrosTabs({ value }: { value: keyof typeof ROUTE_BY_TAB }) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={value}
      onValueChange={(next) => navigate({ to: ROUTE_BY_TAB[next as keyof typeof ROUTE_BY_TAB] })}
    >
      <TabsList>
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
        <TabsTrigger value="contas">Contas e cartões</TabsTrigger>
        <TabsTrigger value="membros">Membros</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
