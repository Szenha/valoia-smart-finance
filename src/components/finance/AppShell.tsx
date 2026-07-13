import { Link } from "@tanstack/react-router";
import {
  BarChart3,
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
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    to: "/settings",
    icon: Settings2,
    section: "cadastros",
    children: [
      { label: "Contas e cartões", to: "/settings", icon: WalletCards },
      { label: "Categorias", to: "/settings", icon: Tags },
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
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white px-4 py-5 lg:flex lg:flex-col">
        <div className="px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-600 text-lg font-semibold text-white">
            C
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Calcum</h1>
          <p className="text-sm text-slate-500">Finanças da casa</p>
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.section === activeSection;
            return (
              <div key={item.label}>
                <Button
                  asChild
                  variant="ghost"
                  className={cn(
                    "h-11 w-full justify-start gap-3 rounded-md px-3 text-slate-600",
                    active && "bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
                  )}
                >
                  <Link to={item.to}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
                {active && item.children ? (
                  <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <Button
                          key={child.label}
                          asChild
                          variant="ghost"
                          className="h-8 w-full justify-start gap-2 px-2 text-xs text-slate-500"
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
          <Button variant="outline" className="justify-start gap-2" onClick={onSignOut}>
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        ) : null}
      </aside>

      <div className="lg:pl-72">
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
