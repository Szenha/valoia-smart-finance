import { Mic, PenLine } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Escolha entre voz e manual — as duas opções têm o mesmo peso visual
 * (mesmo tamanho, mesmo estilo de botão), pra não sugerir que uma é a
 * principal e a outra um atalho secundário. Único disparador de lançamento
 * tanto no botão "Adicionar" do desktop/mobile (Transações) quanto no FAB
 * global (AppShell, mobile).
 */
export function AddEntryChooser({
  open,
  onOpenChange,
  onChooseVoice,
  onChooseManual,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseVoice: () => void;
  onChooseManual: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Novo lançamento</DialogTitle>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onChooseVoice}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-4 py-6 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mic className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-slate-900">Falar</span>
            <span className="text-xs text-muted-foreground">Descreva o gasto em voz alta</span>
          </button>
          <button
            type="button"
            onClick={onChooseManual}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-4 py-6 text-center transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PenLine className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-slate-900">Preencher</span>
            <span className="text-xs text-muted-foreground">Formulário manual</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
