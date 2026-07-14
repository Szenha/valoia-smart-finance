import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
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
import { AppShell } from "@/components/finance/AppShell";
import { CadastrosTabs } from "@/components/finance/CadastrosTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildCategoryTree,
  categoryOptions,
  descendantCategoryIds,
  type CategoryOption,
} from "@/lib/finance/categories";
import { fetchCategories } from "@/lib/finance/data";
import type { CategoryRow } from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/cadastros/categorias")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  component: CategoriasRoute,
});

type CreateStep = "choose" | "category" | "subcategory";
type CategoryType = "expense" | "income" | "transfer";

/** Every ancestor id of `categoryId`, walking up from immediate parent to root. */
function ancestorChain(categories: CategoryRow[], categoryId: string): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const chain: string[] = [];
  let current = byId.get(categoryId);
  while (current?.parent_id) {
    chain.push(current.parent_id);
    current = byId.get(current.parent_id);
  }
  return chain;
}

function CategoriasRoute() {
  const queryClient = useQueryClient();
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCategories(orgId!),
  });

  const categories = categoriesQuery.data ?? [];
  const categoryItems = categoryOptions(categories);
  const categoryTree = buildCategoryTree(categories);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Create flow: "choose" is always the first thing shown.
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>("choose");
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");

  // Edit flow: separate dialog, keeps the full set of fields.
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<CategoryType>("expense");
  const [editParentId, setEditParentId] = useState("root");

  const [deleteCategory, setDeleteCategory] = useState<{
    category: CategoryRow;
    childCount: number;
    transactionCount: number;
  } | null>(null);

  function toggleCategory(categoryId: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function openCreateDialog() {
    setCreateStep("choose");
    setNewName("");
    setNewParentId("");
    setCreateOpen(true);
  }

  function closeCreateDialog(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setCreateStep("choose");
      setNewName("");
      setNewParentId("");
    }
  }

  const createCategory = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      if (createStep === "subcategory" && !newParentId) {
        throw new Error("Escolha a categoria à qual esta subcategoria vai pertencer.");
      }
      const parent =
        createStep === "subcategory" ? categories.find((c) => c.id === newParentId) : null;
      const { error } = await supabase.from("categories").insert({
        organization_id: orgId,
        name: newName,
        type: parent?.type ?? "expense",
        parent_id: createStep === "subcategory" ? newParentId : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      if (createStep === "subcategory" && newParentId) {
        setExpandedCategories((current) => {
          const next = new Set(current);
          next.add(newParentId);
          for (const ancestorId of ancestorChain(categories, newParentId)) next.add(ancestorId);
          return next;
        });
      }
      closeCreateDialog(false);
      await queryClient.invalidateQueries({ queryKey: ["categories", orgId] });
    },
  });

  function startEditCategory(category: CategoryRow) {
    setEditingCategory(category);
    setEditName(category.name);
    setEditType(category.type as CategoryType);
    setEditParentId(category.parent_id ?? "root");
  }

  const blockedParentIds = editingCategory
    ? new Set(descendantCategoryIds(categories, editingCategory.id))
    : new Set<string>();

  const updateCategory = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingCategory) return;
      const { error } = await supabase
        .from("categories")
        .update({
          name: editName,
          type: editType,
          parent_id: editParentId === "root" ? null : editParentId,
        })
        .eq("id", editingCategory.id)
        .eq("organization_id", orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setEditingCategory(null);
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
      title="Categorias"
      subtitle="Categorias e subcategorias usadas nos lançamentos"
    >
      <CadastrosTabs value="categorias" />
      <Card>
        <CardHeader className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Categorias</CardTitle>
          <Button type="button" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Nova categoria
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            {categoryTree.map((category) => (
              <CategoryTreeItem
                key={category.id}
                category={category}
                expanded={expandedCategories}
                onToggle={toggleCategory}
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

      <Dialog open={createOpen} onOpenChange={closeCreateDialog}>
        <DialogContent>
          {createStep === "choose" ? (
            <>
              <DialogHeader>
                <DialogTitle>Nova categoria</DialogTitle>
                <DialogDescription>
                  É uma categoria de primeiro nível ou uma subcategoria de algo que já existe?
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-24 flex-col gap-1"
                  onClick={() => setCreateStep("category")}
                >
                  <span className="font-medium">Categoria</span>
                  <span className="text-xs text-muted-foreground">Nível principal</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-24 flex-col gap-1"
                  disabled={categoryItems.length === 0}
                  onClick={() => setCreateStep("subcategory")}
                >
                  <span className="font-medium">Subcategoria</span>
                  <span className="text-xs text-muted-foreground">
                    Dentro de uma categoria existente
                  </span>
                </Button>
              </div>
            </>
          ) : createStep === "category" ? (
            <>
              <DialogHeader>
                <DialogTitle>Nova categoria</DialogTitle>
              </DialogHeader>
              <div>
                <Label>Nome</Label>
                <Input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCreateStep("choose")}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={() => createCategory.mutate()}
                  disabled={!newName || createCategory.isPending}
                >
                  Criar categoria
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Nova subcategoria</DialogTitle>
              </DialogHeader>
              <div>
                <Label>Categoria</Label>
                <Select value={newParentId} onValueChange={setNewParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a categoria pai" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={newName} onChange={(event) => setNewName(event.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCreateStep("choose")}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={() => createCategory.mutate()}
                  disabled={!newName || !newParentId || createCategory.isPending}
                >
                  Criar subcategoria
                </Button>
              </DialogFooter>
            </>
          )}
          {createCategory.error ? (
            <p className="text-sm text-red-700">
              {createCategory.error instanceof Error
                ? createCategory.error.message
                : String(createCategory.error)}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar categoria</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nome</Label>
            <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={editType} onValueChange={(value) => setEditType(value as CategoryType)}>
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
            <Select value={editParentId} onValueChange={setEditParentId}>
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditingCategory(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => updateCategory.mutate()}
              disabled={!editName || updateCategory.isPending}
            >
              Salvar categoria
            </Button>
          </DialogFooter>
          {updateCategory.error ? (
            <p className="text-sm text-red-700">
              {updateCategory.error instanceof Error
                ? updateCategory.error.message
                : String(updateCategory.error)}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

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
  onEdit,
  onDelete,
}: {
  category: CategoryOption;
  expanded: Set<string>;
  onToggle: (categoryId: string) => void;
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
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  );
}
