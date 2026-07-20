import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type IconOption = { value: string; label: string; icon: LucideIcon };

/** Remove acentos pra busca não depender de digitar "á", "ã" etc. certinho. */
function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Grade de ícones pesquisável — extraído de categorias (categorias.tsx) pra
 *  ser reaproveitado também pelos eventos do calendário, com um
 *  catálogo de opções diferente em cada caso. */
export function IconPicker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (icon: string) => void;
  options: IconOption[];
}) {
  const [search, setSearch] = useState("");
  const query = normalizeSearch(search.trim());
  const filteredOptions = query
    ? options.filter((option) => normalizeSearch(option.label).includes(query))
    : options;
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div>
      <Label>Ícone{selectedOption ? ` — ${selectedOption.label}` : ""}</Label>
      <Input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar ícone…"
        className="mt-1"
      />
      <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {filteredOptions.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            Nenhum ícone encontrado para "{search}".
          </p>
        ) : (
          filteredOptions.map((option) => {
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
          })
        )}
      </div>
    </div>
  );
}
