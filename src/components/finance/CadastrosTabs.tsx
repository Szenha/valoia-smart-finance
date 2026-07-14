import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CadastrosTabs({ value }: { value: "categorias" | "contas" }) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={value}
      onValueChange={(next) =>
        navigate({
          to: next === "categorias" ? "/cadastros/categorias" : "/cadastros/contas-e-cartoes",
        })
      }
    >
      <TabsList>
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
        <TabsTrigger value="contas">Contas e cartões</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
