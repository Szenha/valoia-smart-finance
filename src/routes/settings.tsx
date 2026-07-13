import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  buildCategoryTree,
  categoryOptions,
  descendantCategoryIds,
  type CategoryOption,
} from "@/lib/finance/categories";
import { fetchAccounts, fetchCategories } from "@/lib/finance/data";
import type { AccountKind, CategoryRow } from "@/lib/finance/types";
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
  const [categoryParentId, setCategoryParentId] = useState("root");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [deleteCategory, setDeleteCategory] = useState<{
    category: CategoryRow;
    childCount: number;
    transactionCount: number;
  } | null>(null);
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
        parent_id: categoryParentId === "root" ? null : categoryParentId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setCategoryName("");
      setCategoryParentId("root");
      setEditingCategoryId(null);
      await queryClient.invalidateQueries({ queryKey: ["categories", orgId] });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingCategoryId) return;
      const { error } = await supabase
        .from("categories")
        .update({
          name: categoryName,
          type: categoryType,
          parent_id: categoryParentId === "root" ? null : categoryParentId,
        })
        .eq("id", editingCategoryId)
        .eq("organization_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setCategoryName("");
      setCategoryParentId("root");
      setEditingCategoryId(null);
      await queryClient.invalidateQueries({ queryKey: ["categories", orgId] });
    },
  });

  const removeCategory = useMutation({
    mutationFn: async () => {
      if (!orgId || !deleteCategory) return;
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", deleteCategory.category.id)
        .eq("organization_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setDeleteCategory(null);
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

  const categories = categoriesQuery.data ?? [];
  const categoryItems = categoryOptions(categories);
  const categoryTree = buildCategoryTree(categories);
  const blockedParentIds = editingCategoryId
    ? new Set(descendantCategoryIds(categories, editingCategoryId))
    : new Set<string>();

  function toggleCategory(categoryId: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function startCreateChild(category: CategoryRow) {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryType(category.type as typeof categoryType);
    setCategoryParentId(category.id);
    setExpandedCategories((current) => new Set(current).add(category.id));
  }

  function startEditCategory(category: CategoryRow) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryType(category.type as typeof categoryType);
    setCategoryParentId(category.parent_id ?? "root");
  }

  function cancelCategoryForm() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryType("expense");
    setCategoryParentId("root");
  }

  async function confirmDeleteCategory(category: CategoryRow) {
    if (!orgId) return;
    const ids = descendantCategoryIds(categories, category.id);
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("category_id", ids);
    if (error) throw new Error(error.message);
    setDeleteCategory({
      category,
      childCount: ids.length - 1,
      transactionCount: count ?? 0,
    });
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
              <div className="grid gap-3 md:grid-cols-4">
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
                <div>
                  <Label>Dentro de</Label>
                  <Select value={categoryParentId} onValueChange={setCategoryParentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Categoria principal</SelectItem>
                      {categoryItems
                        .filter((category) => !blockedParentIds.has(category.id))
                        .map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.path}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="md:col-span-4"
                  onClick={() =>
                    editingCategoryId ? updateCategory.mutate() : addCategory.mutate()
                  }
                  disabled={!categoryName}
                >
                  {editingCategoryId ? "Salvar categoria" : "Criar categoria"}
                </Button>
                {editingCategoryId || categoryParentId !== "root" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="md:col-span-4"
                    onClick={cancelCategoryForm}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancelar edição
                  </Button>
                ) : null}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2">
                {categoryTree.map((category) => (
                  <CategoryTreeItem
                    key={category.id}
                    category={category}
                    expanded={expandedCategories}
                    onToggle={toggleCategory}
                    onCreateChild={startCreateChild}
                    onEdit={startEditCategory}
                    onDelete={confirmDeleteCategory}
                  />
                ))}
                {categoryTree.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Nenhuma categoria criada.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AlertDialog
        open={!!deleteCategory}
        onOpenChange={(open) => !open && setDeleteCategory(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCategory
                ? `"${deleteCategory.category.name}" possui ${deleteCategory.childCount} subcategoria(s) e ${deleteCategory.transactionCount} transação(ões) vinculada(s), considerando toda a árvore. Ao excluir, as transações ficam sem categoria e subcategorias diretas sobem para o nível principal.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeCategory.mutate()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function CategoryTreeItem({
  category,
  expanded,
  onToggle,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  category: CategoryOption;
  expanded: Set<string>;
  onToggle: (categoryId: string) => void;
  onCreateChild: (category: CategoryRow) => void;
  onEdit: (category: CategoryRow) => void;
  onDelete: (category: CategoryRow) => void;
}) {
  const hasChildren = category.children.length > 0;
  const isExpanded = expanded.has(category.id);

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50"
        style={{ paddingLeft: `${category.depth * 18 + 8}px` }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!hasChildren}
          onClick={() => onToggle(category.id)}
        >
          {hasChildren && isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{category.name}</p>
          <p className="truncate text-xs text-muted-foreground">{category.path}</p>
        </div>
        <span className="hidden rounded bg-slate-100 px-2 py-1 text-xs text-muted-foreground sm:inline">
          {category.type}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCreateChild(category)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(category)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-700"
          onClick={() => onDelete(category)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {hasChildren && isExpanded
        ? category.children.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              expanded={expanded}
              onToggle={onToggle}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  );
}
