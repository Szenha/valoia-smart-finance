import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CategoryOption } from "@/lib/finance/categories";
import { categoryIconFor } from "@/lib/finance/category-icons";
import { cn } from "@/lib/utils";

/** Segmentos intermediários do path, sem o nó raiz do tipo ("Saída"/
 *  "Entrada" — já implícito pelo filtro por tipo) e sem o próprio nome da
 *  categoria — só o que ajuda a diferenciar folhas com nomes parecidos em
 *  grupos diferentes (ex: "Mercado" dentro de "Casa" vs dentro de "Pet"). */
function middlePath(category: CategoryOption): string {
  const segments = category.path.split(" > ");
  return segments.slice(1, -1).join(" › ");
}

type Props = {
  /** Já filtradas para folhas (leafCategoryOptions) — este componente não
   *  filtra hierarquia, só tipo (quando `type` é informado) e busca. */
  options: CategoryOption[];
  value: string | null | undefined;
  onChange: (categoryId: string) => void;
  /** Restringe às categorias desse tipo — numa despesa não faz sentido
   *  listar categorias de receita, e vice-versa. Omitir mostra todas
   *  (ex: filtro de relatório, ou transferência). */
  type?: "income" | "expense" | "transfer" | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
  /** Mostra "Sem categoria" como primeira opção (limpa a seleção). */
  allowNone?: boolean;
  noneLabel?: string;
};

/**
 * Seletor de categoria com busca — substitui o <Select> simples nos pontos
 * onde categorizar manualmente é frequente. O <Select> nativo só rola uma
 * lista longa sem filtrar por texto, e mostrava o path inteiro ("Saída >
 * Casa > Supermercado") como label, incluindo categorias do tipo errado
 * (receita numa despesa) — os três problemas que motivaram isto.
 */
export function CategoryPicker({
  options,
  value,
  onChange,
  type,
  placeholder = "Selecione uma categoria",
  disabled,
  className,
  size = "default",
  allowNone = true,
  noneLabel = "Sem categoria",
}: Props) {
  const [open, setOpen] = useState(false);
  const filtered = type ? options.filter((option) => option.type === type) : options;
  const selected = value ? filtered.find((option) => option.id === value) : null;
  const SelectedIcon = selected ? categoryIconFor(selected.icon, selected.type) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {SelectedIcon ? <SelectedIcon className="h-3.5 w-3.5 shrink-0" /> : null}
            <span className="truncate">{selected ? selected.name : placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria…" />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {allowNone ? (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")} />
                  <span className="text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              ) : null}
              {filtered.map((category) => {
                const Icon = categoryIconFor(category.icon, category.type);
                const secondary = middlePath(category);
                return (
                  <CommandItem
                    key={category.id}
                    value={`${category.name} ${category.path}`}
                    onSelect={() => {
                      onChange(category.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5",
                        value === category.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      style={category.color ? { color: category.color } : undefined}
                    />
                    <span className="min-w-0 flex-1 truncate">{category.name}</span>
                    {secondary ? (
                      <span className="shrink-0 truncate text-xs text-muted-foreground">
                        {secondary}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
