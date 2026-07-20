import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryTree } from "@/components/finance/CategoryTree";
import {
  buildCategoryTree,
  categoryOptions,
  descendantCategoryIds,
  findSiblingGroup,
} from "@/lib/finance/categories";
import { CATEGORY_ICON_OPTIONS } from "@/lib/finance/category-icons";
import { fetchCategories, updateCategorySortOrder } from "@/lib/finance/data";
import { categoryTypeLabel, type CategoryRow, type CategoryType } from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/cadastros/categorias")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  component: CategoriasRoute,
});

type CreateStep = "choose" | "category" | "subcategory";

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
  const hasSeededExpansion = useRef(false);

  useEffect(() => {
    const loaded = categoriesQuery.data;
    if (hasSeededExpansion.current || !loaded || loaded.length === 0) return;
    hasSeededExpansion.current = true;
    const parentsWithChildren = new Set(
      loaded.filter((category) => category.parent_id).map((category) => category.parent_id!),
    );
    setExpandedCategories(parentsWithChildren);
  }, [categoriesQuery.data]);

  // Create flow: "choose" is always the first thing shown.
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>("choose");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CategoryType | null>(null);
  const [newParentId, setNewParentId] = useState("");
  const [newIcon, setNewIcon] = useState("");

  // Edit flow: separate dialog, keeps the full set of fields.
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<CategoryType>("expense");
  const [editParentId, setEditParentId] = useState("root");
  const [editIcon, setEditIcon] = useState("");

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
    setNewType(null);
    setNewParentId("");
    setNewIcon("");
    setCreateOpen(true);
  }

  function closeCreateDialog(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setCreateStep("choose");
      setNewName("");
      setNewType(null);
      setNewParentId("");
      setNewIcon("");
    }
  }

  const newParentCategory =
    createStep === "subcategory" ? categories.find((c) => c.id === newParentId) : undefined;

  const createCategory = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      if (createStep === "subcategory" && !newParentId) {
        throw new Error("Escolha a categoria à qual esta subcategoria vai pertencer.");
      }
      if (createStep === "category" && !newType) {
        throw new Error("Escolha se a categoria é de despesa ou receita.");
      }
      const parent =
        createStep === "subcategory" ? categories.find((c) => c.id === newParentId) : null;
      const { error } = await supabase.from("categories").insert({
        organization_id: orgId,
        name: newName,
        type: createStep === "subcategory" ? parent!.type : newType,
        parent_id: createStep === "subcategory" ? newParentId : null,
        icon: newIcon || null,
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
    setEditIcon(category.icon ?? "");
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
          icon: editIcon || null,
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

  const reorderCategories = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) =>
      updateCategorySortOrder(updates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories", orgId] });
    },
  });

  function moveCategory(category: CategoryRow, direction: "up" | "down") {
    const siblings = findSiblingGroup(categoryTree, category.id);
    if (!siblings) return;
    const index = siblings.findIndex((sibling) => sibling.id === category.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    reorderCategories.mutate(
      reordered.map((sibling, position) => ({
        id: sibling.id,
        sort_order: position,
      })),
    );
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
            <CategoryTree
              nodes={categoryTree}
              expanded={expandedCategories}
              onToggle={toggleCategory}
              renderActions={(category) => {
                const siblings = findSiblingGroup(categoryTree, category.id) ?? [];
                const index = siblings.findIndex((sibling) => sibling.id === category.id);
                return (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Mover para cima"
                      disabled={index <= 0}
                      onClick={() => moveCategory(category, "up")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Mover para baixo"
                      disabled={index < 0 || index >= siblings.length - 1}
                      onClick={() => moveCategory(category, "down")}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => startEditCategory(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-700"
                      onClick={() => confirmDeleteCategory(category)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                );
              }}
            />
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
                <Label>Tipo</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="mt-1 justify-start"
                  value={newType ?? ""}
                  onValueChange={(value) => setNewType(value ? (value as CategoryType) : null)}
                >
                  <ToggleGroupItem value="expense" className="px-4">
                    {categoryTypeLabel.expense}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="income" className="px-4">
                    {categoryTypeLabel.income}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div>
                <Label>Nome</Label>
                <Input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <IconPicker value={newIcon} onChange={setNewIcon} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCreateStep("choose")}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={() => createCategory.mutate()}
                  disabled={!newName || !newType || createCategory.isPending}
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
                {newParentCategory ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Esta subcategoria será classificada como{" "}
                    <strong>{categoryTypeLabel[newParentCategory.type]}</strong>, seguindo a
                    categoria {newParentCategory.name}.
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={newName} onChange={(event) => setNewName(event.target.value)} />
              </div>
              <IconPicker value={newIcon} onChange={setNewIcon} />
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
                <SelectItem value="expense">{categoryTypeLabel.expense}</SelectItem>
                <SelectItem value="income">{categoryTypeLabel.income}</SelectItem>
                <SelectItem value="transfer">{categoryTypeLabel.transfer}</SelectItem>
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
          <IconPicker value={editIcon} onChange={setEditIcon} />
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

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div>
      <Label>Ícone</Label>
      <div className="mt-1 flex flex-wrap gap-2">
        {CATEGORY_ICON_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={option.label}
              aria-pressed={selected}
              onClick={() => onChange(selected ? "" : option.value)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                selected
                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
