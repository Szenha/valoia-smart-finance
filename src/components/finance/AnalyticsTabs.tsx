import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AnalyticsTabs({ value }: { value: "dashboard" | "reports" }) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={value}
      onValueChange={(next) => navigate({ to: next === "dashboard" ? "/dashboard" : "/reports" })}
    >
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="reports">Relatórios</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
