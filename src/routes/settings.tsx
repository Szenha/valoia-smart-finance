import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/finance/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAccounts, fetchCategories } from "@/lib/finance/data";
import type { AccountKind } from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const queryClient = useQueryClient();
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAccounts(orgId!),
  });
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"expense" | "income" | "transfer">("expense");
  const [accountName, setAccountName] = useState("");
  const [accountKey, setAccountKey] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");

  const addCategory = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from("categories").insert({
        organization_id: orgId,
        name: categoryName,
        type: categoryType,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setCategoryName("");
      await queryClient.invalidateQueries({ queryKey: ["categories", orgId] });
    },
  });

  const addAccount = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase.from("financial_accounts").upsert(
        {
          organization_id: orgId,
          account_key: accountKey,
          name: accountName,
          institution: institution || null,
          kind,
        },
        { onConflict: "organization_id,account_key" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setAccountName("");
      setAccountKey("");
      setInstitution("");
      await queryClient.invalidateQueries({ queryKey: ["accounts", orgId] });
    },
  });

  async function archiveAccount(id: string, archived: boolean) {
    await supabase.from("financial_accounts").update({ archived: !archived }).eq("id", id);
    await queryClient.invalidateQueries({ queryKey: ["accounts", orgId] });
  }

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  return (
    <AppShell
      activeSection="cadastros"
      title="Cadastros"
      subtitle="Contas, cartões e categorias usados nos lançamentos"
    >
      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">Contas e cartões</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Contas e cartões</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Chave da conta</Label>
                  <Input
                    value={accountKey}
                    onChange={(event) => setAccountKey(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Instituição</Label>
                  <Input
                    value={institution}
                    onChange={(event) => setInstitution(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={kind} onValueChange={(value) => setKind(value as AccountKind)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Conta corrente</SelectItem>
                      <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                      <SelectItem value="investment">Investimento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="md:col-span-2"
                  onClick={() => addAccount.mutate()}
                  disabled={!accountName || !accountKey}
                >
                  Salvar conta
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(accountsQuery.data ?? []).map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm"
                  >
                    <div>
                      <strong>{account.name}</strong>
                      <p className="text-muted-foreground">
                        {account.institution ?? "Sem instituição"} · {account.kind}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archiveAccount(account.id, account.archived)}
                    >
                      {account.archived ? "Reativar" : "Arquivar"}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>Categorias</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Label>Nome</Label>
                  <Input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={categoryType}
                    onValueChange={(value) => setCategoryType(value as typeof categoryType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Despesa</SelectItem>
                      <SelectItem value="income">Receita</SelectItem>
                      <SelectItem value="transfer">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="md:col-span-3"
                  onClick={() => addCategory.mutate()}
                  disabled={!categoryName}
                >
                  Criar categoria
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(categoriesQuery.data ?? []).map((category) => (
                  <div
                    key={category.id}
                    className="flex justify-between rounded-lg border border-slate-200 bg-white p-4 text-sm"
                  >
                    <span>{category.name}</span>
                    <span className="text-muted-foreground">{category.type}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
