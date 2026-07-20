import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estiliza o botão de confirmar em vermelho — para ações destrutivas
   *  (excluir, remover) em vez de neutras. */
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Substitui window.confirm() por um modal com a cara do app — monta uma
 *  vez na raiz e fica disponível em qualquer componente via useConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Evita resolver duas vezes: clicar em "Confirmar" fecha o AlertDialog,
  // o que também dispara onOpenChange(false) — sem essa trava isso
  // resolveria a promise como true e depois como false.
  const settledRef = useRef(false);

  const confirm = useCallback<ConfirmFn>((options) => {
    const normalized = typeof options === "string" ? { description: options } : options;
    return new Promise<boolean>((resolve) => {
      settledRef.current = false;
      setPending({ ...normalized, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      if (settledRef.current) return;
      settledRef.current = true;
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title ?? "Confirmar"}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{pending?.cancelLabel ?? "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(pending?.destructive && buttonVariants({ variant: "destructive" }))}
            >
              {pending?.confirmLabel ?? "Continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** Retorna uma função async: `await confirm("Excluir isso?")` ou
 *  `await confirm({ title, description, destructive: true })` — resolve
 *  `true`/`false` conforme o usuário confirma ou cancela/fecha o modal. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de um ConfirmProvider");
  return ctx;
}
