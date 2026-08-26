import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "ticlio:install-banner-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    navigatorWithStandalone.standalone === true
  );
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;

    setIos(isIOS());
    setVisible(true);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  // Only worth showing when we can actually help: iOS gets manual steps,
  // other platforms need a captured install prompt to trigger natively.
  if (!visible || (!ios && !deferredPrompt)) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
      <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-slate-950">Instale o Ticlio no seu celular</p>
        {ios ? (
          <p className="text-xs text-slate-600">
            Toque em <Share className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom" /> Compartilhar
            e depois em "Adicionar à Tela de Início".
          </p>
        ) : (
          <p className="text-xs text-slate-600">
            Acesso rápido em tela cheia, sem precisar abrir o navegador toda vez.
          </p>
        )}
      </div>
      {!ios && deferredPrompt ? (
        <Button type="button" size="sm" className="shrink-0" onClick={() => void handleInstallClick()}>
          Instalar
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={dismiss}
        aria-label="Fechar"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
