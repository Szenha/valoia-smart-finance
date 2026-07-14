import { Link, useLocation } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PiggyBank,
  Settings2,
  Tags,
  WalletCards,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ValoiaLogo } from "@/components/brand/valoia-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "calcum:sidebar-collapsed";

type Section = "day" | "cadastros" | "conciliacao" | "planejamento" | "analytics";

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

const navItems: NavItem[] = [
  { label: "Dia a dia", to: "/", icon: ListChecks, section: "day" },
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white py-5 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px] px-2" : "w-72 px-4",
        )}
      >
        <div className={cn("px-2", collapsed && "flex justify-center px-0")}>
          {collapsed ? (
            <ValoiaLogo variant="icon" className="h-10 w-10 rounded-lg" />
          ) : (
            <ValoiaLogo variant="full-on-light" className="w-full" />
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
        <nav className="mt-4 flex flex-1 flex-col gap-1">
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
                    "h-11 w-full gap-3 rounded-md px-3 text-slate-600",
                    collapsed ? "justify-center px-0" : "justify-start",
                    active && "bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
                  )}
                >
                  <Link to={item.to} aria-label={collapsed ? item.label : undefined}>
                    <Icon className="h-4 w-4 shrink-0" />
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
                            childActive && "bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
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
            className={cn("gap-2", collapsed ? "justify-center px-0" : "justify-start")}
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed ? "Sair" : null}
          </Button>
        ) : null}
      </aside>

      <div
        className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-72")}
      >
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
              {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
              {userEmail ? <p className="text-xs text-slate-400">{userEmail}</p> : null}
            </div>
            <div className="flex gap-2 lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.section === activeSection;
                return (
                  <Button
                    key={item.label}
                    asChild
                    variant={active ? "default" : "outline"}
                    size="icon"
                    className="h-9 w-9"
                  >
                    <Link to={item.to} aria-label={item.label}>
                      <Icon className="h-4 w-4" />
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
