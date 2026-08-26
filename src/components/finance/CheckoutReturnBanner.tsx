import { AlertCircle, CheckCircle2, Clock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type CheckoutStatus = "sucesso" | "cancelado" | "expirado";

const COPY: Record<CheckoutStatus, { icon: typeof CheckCircle2; text: string; className: string }> =
  {
    sucesso: {
      icon: Clock,
      text: "Recebemos seu checkout. Assim que a Asaas confirmar o pagamento, seu plano é liberado automaticamente — pode levar alguns minutos.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
    cancelado: {
      icon: AlertCircle,
      text: 'Checkout cancelado. Você pode tentar novamente quando quiser, em "Meu plano".',
      className: "border-slate-200 bg-slate-50 text-slate-700",
    },
    expirado: {
      icon: AlertCircle,
      text: 'O link de pagamento expirou. Abra "Meu plano" para gerar um novo.',
      className: "border-amber-200 bg-amber-50 text-amber-950",
    },
  };

// Só reflete o desfecho do fluxo no navegador (a Asaas redirecionou de
// volta) — nunca é usado como confirmação financeira, que depende só do
// webhook. Lê a URL fora do roteamento (mesmo padrão do InstallAppBanner).
export function CheckoutReturnBanner() {
  const [status, setStatus] = useState<CheckoutStatus | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const value = params.get("checkout");
    if (value === "sucesso" || value === "cancelado" || value === "expirado") {
      setStatus(value);
      params.delete("checkout");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
    }
  }, []);

  if (!status) return null;

  const { icon: Icon, text, className } = COPY[status];

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">{text}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => setStatus(null)}
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
