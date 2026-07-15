import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mic,
  PiggyBank,
  Settings2,
  Tags,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { TiclioLogo } from "@/components/brand/ticlio-logo";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { fetchAccounts, fetchCategories } from "@/lib/finance/data";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { QuickAddForm } from "./QuickAddForm";

const SIDEBAR_COLLAPSED_KEY = "calcum:sidebar-collapsed";

type Section = "day" | "cadastros" | "membros" | "conciliacao" | "planejamento" | "analytics";

type AppShellProps = {
  activeSection: Section;
  title: string;
  subtitle?: string;
  userEmail?: string;
  onSignOut?: () => void;
  children: ReactNode;
};

type NavItem = {
  label: string;
  to: string;
  icon: typeof ListChecks;
  section: Section;
  children?: { label: string; to: string; icon: typeof ListChecks }[];
};

// Single source of nav items — both the desktop sidebar and the mobile
// bottom bar render from this same array, split only by CSS breakpoint.
const navItems: NavItem[] = [
  { label: "Transações", to: "/", icon: ListChecks, section: "day" },
  {
    label: "Cadastros",
    to: "/cadastros/categorias",
    icon: Settings2,
    section: "cadastros",
    children: [
      { label: "Categorias", to: "/cadastros/categorias", icon: Tags },
      { label: "Contas e cartões", to: "/cadastros/contas-e-cartoes", icon: WalletCards },
    ],
  },
  { label: "Membros", to: "/cadastros/membros", icon: Users, section: "membros" },
  {
    label: "Conciliação",
    to: "/conciliacao",
    icon: ClipboardCheck,
    section: "conciliacao",
  },
  { label: "Planejamento", to: "/planejamento", icon: PiggyBank, section: "planejamento" },
  {
    label: "Análises",
    to: "/dashboard",
    icon: BarChart3,
    section: "analytics",
    children: [
      { label: "Dashboard", to: "/dashboard", icon: Gauge },
      { label: "Relatórios", to: "/reports", icon: LayoutDashboard },
    ],
  },
];

export function AppShell({
  activeSection,
  title,
  subtitle,
  userEmail,
  onSignOut,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Data for the mobile "quick add by voice" FAB sheet. Every route already
  // queries these under the same keys, so this just reuses the cache — it
  // doesn't add network requests once a page has populated it.
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
  });
  // Prefer the freshly-fetched session email over the per-route userEmail
  // prop, which not every route passes and can go stale — this is the
  // "who am I logged in as" indicator shown in the header on every page.
  const loggedInEmail = currentUserQuery.data?.email ?? userEmail ?? null;
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

  return (
    <div className="min-h-screen bg-background text-slate-950">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white py-5 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px] px-2" : "w-60 px-4",
        )}
      >
        <div className="flex justify-center px-0">
          {collapsed ? (
            <TiclioLogo variant="icon" className="h-10 w-10 rounded-lg" />
          ) : (
            <TiclioLogo variant="full-on-light" style={{ height: 32, width: "auto" }} />
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("mt-3 h-8 w-8 text-slate-500", collapsed ? "self-center" : "self-end")}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
        <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.section === activeSection;
            return (
              <div key={item.label}>
                <Button
                  asChild
                  variant="ghost"
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "h-11 w-full gap-2.5 rounded-xl px-2.5 font-medium text-slate-600",
                    collapsed ? "justify-center px-0" : "justify-start",
                    active && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  <Link to={item.to} aria-label={collapsed ? item.label : undefined}>
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-primary text-white" : "text-slate-500",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 2} />
                    </span>
                    {!collapsed ? item.label : null}
                  </Link>
                </Button>
                {active && item.children && !collapsed ? (
                  <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const childActive = location.pathname === child.to;
                      return (
                        <Button
                          key={child.label}
                          asChild
                          variant="ghost"
                          className={cn(
                            "h-8 w-full justify-start gap-2 px-2 text-xs text-slate-500",
                            childActive && "bg-primary/10 text-primary hover:bg-primary/10",
                          )}
                        >
                          <Link to={child.to}>
                            <ChildIcon className="h-3.5 w-3.5" />
                            {child.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        {onSignOut ? (
          <Button
            type="button"
            variant="outline"
            title={collapsed ? "Sair" : undefined}
            className={cn(
              "mt-3 shrink-0 gap-2",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed ? "Sair" : null}
          </Button>
        ) : null}
      </aside>

      <div
        className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-60")}
      >
        <header className="sticky top-0 z-20 px-4 pt-3 backdrop-blur lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.1)] backdrop-blur lg:px-6 lg:py-3">
            <div className="flex min-w-0 items-center gap-3">
              <TiclioLogo
                variant="icon"
                className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-slate-200"
              />
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-slate-950 lg:text-xl">
                  {title}
                </h2>
                {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {loggedInEmail ? (
                <span
                  className="hidden max-w-[220px] truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-block"
                  title={loggedInEmail}
                >
                  {loggedInEmail}
                </span>
              ) : null}
              {onSignOut ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  onClick={onSignOut}
                  aria-label="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:px-8 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation — same navItems as the desktop sidebar. */}
      <nav
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex items-stretch gap-1 rounded-full border border-slate-200/70 bg-white/95 p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-10px_rgba(0,0,0,0.18)] backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.section === activeSection;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[10px] font-medium text-slate-500 transition-colors",
                active && "bg-slate-100 text-slate-900",
              )}
            >
              <Icon
                className={cn("h-5 w-5", active && "text-primary")}
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="truncate px-0.5">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Voice quick-add FAB — mobile only. On desktop the quick-add form is
          already pinned at the top of "Transações" in full, so a floating
          duplicate would just add clutter; on mobile that form is buried at
          the top of a page the user may not be on, which is the gap this
          closes. */}
      <Button
        type="button"
        size="icon"
        className="fixed right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 lg:hidden [bottom:calc(env(safe-area-inset-bottom)+5.5rem)]"
        aria-label="Registrar por voz"
        onClick={() => setVoiceSheetOpen(true)}
      >
        <Mic className="h-6 w-6" />
      </Button>

      <Drawer open={voiceSheetOpen} onOpenChange={setVoiceSheetOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Lançamento rápido</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {voiceSheetOpen ? (
              orgId ? (
                <QuickAddForm
                  bare
                  autoFocusInput
                  orgId={orgId}
                  userId={currentUserQuery.data?.id ?? null}
                  categories={categoriesQuery.data ?? []}
                  accounts={accountsQuery.data ?? []}
                  onSaved={() => setVoiceSheetOpen(false)}
                />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
              )
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
