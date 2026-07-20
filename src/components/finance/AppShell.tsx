import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ClipboardCheck,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mic,
  Pencil,
  PiggyBank,
  Plus,
  Settings2,
  Tags,
  Target,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { TiclioLogo } from "@/components/brand/ticlio-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  fetchAccounts,
  fetchAdditionalCards,
  fetchCategories,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  renameOrganization,
} from "@/lib/finance/data";
import type { OrganizationRow } from "@/lib/finance/types";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { VoiceCaptureFlow } from "./VoiceCaptureFlow";

const SIDEBAR_COLLAPSED_KEY = "calcum:sidebar-collapsed";

type Section =
  | "day"
  | "cadastros"
  | "membros"
  | "conciliacao"
  | "planejamento"
  | "calendario"
  | "analytics";

type AppShellProps = {
  activeSection: Section;
  title: string;
  subtitle?: string;
  userEmail?: string;
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
  {
    label: "Planejamento",
    to: "/planejamento/orcamento",
    icon: PiggyBank,
    section: "planejamento",
    children: [
      { label: "Orçamento", to: "/planejamento/orcamento", icon: PiggyBank },
      { label: "Metas e objetivos", to: "/planejamento/metas", icon: Target },
      { label: "Contas fixas", to: "/planejamento/contas-fixas", icon: CalendarClock },
    ],
  },
  { label: "Calendário", to: "/calendario", icon: CalendarDays, section: "calendario" },
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

export function AppShell({ activeSection, title, subtitle, userEmail, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

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

  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
  });
  const currentUserId = currentUserQuery.data?.id ?? null;
  // Prefer the freshly-fetched session email over the per-route userEmail
  // prop, which not every route passes and can go stale — this is the
  // "who am I logged in as" indicator shown in the header on every page.
  const loggedInEmail = currentUserQuery.data?.email ?? userEmail ?? null;

  // Data for the mobile "quick add by voice" FAB sheet. Every route already
  // queries these under the same keys, so this just reuses the cache — it
  // doesn't add network requests once a page has populated it.
  const workspace = useActiveOrganization(currentUserId);
  const orgId = workspace.orgId;
  const activeOrganization =
    workspace.organizations.find((org) => org.id === orgId) ?? workspace.organizations[0] ?? null;

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState("");

  async function handleCreateWorkspace() {
    const name = createName.trim();
    if (!name) return;
    setCreatePending(true);
    setCreateError("");
    try {
      await workspace.createWorkspace(name);
      setCreateOpen(false);
      setCreateName("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatePending(false);
    }
  }

  const [renamingOrg, setRenamingOrg] = useState<OrganizationRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState("");

  function openRename(org: OrganizationRow) {
    setRenamingOrg(org);
    setRenameValue(org.name);
    setRenameError("");
  }

  async function handleRenameWorkspace() {
    if (!renamingOrg) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenamePending(true);
    setRenameError("");
    try {
      await renameOrganization(renamingOrg.id, name);
      await workspace.refetchOrganizations();
      setRenamingOrg(null);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenamePending(false);
    }
  }
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
  const additionalCardsQuery = useQuery({
    queryKey: ["additional-cards", orgId],
    enabled: !!orgId,
    queryFn: () => fetchAdditionalCards(orgId!),
  });
  const membersQuery = useQuery({
    queryKey: ["household-members", orgId],
    enabled: !!orgId,
    queryFn: () => fetchHouseholdMembers(orgId!),
  });
  const memberIds = (membersQuery.data ?? []).map((member) => member.user_id);
  const profilesQuery = useQuery({
    queryKey: ["member-profiles", orgId, memberIds],
    enabled: !!orgId && memberIds.length > 0,
    queryFn: () => fetchMemberProfiles(memberIds),
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
            <WorkspaceMenu
              organizations={workspace.organizations}
              activeOrg={activeOrganization}
              onSwitch={workspace.switchOrganization}
              onRename={openRename}
              onCreate={() => setCreateOpen(true)}
              trigger={
                <button
                  type="button"
                  aria-label="Trocar workspace"
                  className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <TiclioLogo variant="icon" className="h-10 w-10 rounded-lg" />
                </button>
              }
            />
          ) : (
            <TiclioLogo variant="full-on-light" style={{ height: 32, width: "auto" }} />
          )}
        </div>
        {!collapsed ? (
          <WorkspaceMenu
            organizations={workspace.organizations}
            activeOrg={activeOrganization}
            onSwitch={workspace.switchOrganization}
            onRename={openRename}
            onCreate={() => setCreateOpen(true)}
            trigger={
              <button
                type="button"
                aria-label="Trocar workspace"
                className="mt-3 flex w-full items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                  {activeOrganization?.name ?? "Workspace"}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
            }
          />
        ) : null}
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
        <Button
          type="button"
          variant="outline"
          title={collapsed ? "Sair" : undefined}
          className={cn("mt-3 shrink-0 gap-2", collapsed ? "justify-center px-0" : "justify-start")}
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed ? "Sair" : null}
        </Button>
      </aside>

      <div
        className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-60")}
      >
        <header className="sticky top-0 z-20 px-4 pt-3 backdrop-blur lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.1)] backdrop-blur lg:px-6 lg:py-3">
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceMenu
                organizations={workspace.organizations}
                activeOrg={activeOrganization}
                onSwitch={workspace.switchOrganization}
                onRename={openRename}
                onCreate={() => setCreateOpen(true)}
                trigger={
                  <button
                    type="button"
                    aria-label="Trocar workspace"
                    className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <TiclioLogo
                      variant="icon"
                      className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-slate-200"
                    />
                  </button>
                }
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
              {/* Desktop already has Sair pinned at the bottom of the sidebar
                  (always visible now, regardless of route) — showing it here
                  too would be redundant. Mobile has no sidebar, so it stays
                  here as the only way to sign out on that breakpoint. */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
                onClick={handleSignOut}
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:px-8 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation — same navItems as the desktop sidebar,
          minus whichever section is currently active: you're already there,
          so showing it back at you just eats space that 6 items don't have
          on a phone-width screen. The desktop sidebar is a separate block
          above and keeps showing all items with the active one highlighted —
          this only changes the mobile bar. */}
      <nav
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex items-stretch gap-1 rounded-full border border-slate-200/70 bg-white/95 p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-10px_rgba(0,0,0,0.18)] backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        {navItems
          .filter((item) => item.section !== activeSection)
          .map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.to}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[10px] font-medium text-slate-500 transition-colors"
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
                <span className="truncate px-0.5">{item.label}</span>
              </Link>
            );
          })}
      </nav>

      {/* Voice quick-add FAB — mobile only. Same 4-stage capture flow as the
          hero button on "Transações", available from any page so the user
          never has to navigate away to add something by voice. */}
      <Button
        type="button"
        size="icon"
        className="fixed right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 lg:hidden [bottom:calc(env(safe-area-inset-bottom)+5.5rem)]"
        aria-label="Registrar por voz"
        onClick={() => setVoiceSheetOpen(true)}
      >
        <Mic className="h-6 w-6" />
      </Button>

      {orgId ? (
        <VoiceCaptureFlow
          open={voiceSheetOpen}
          onOpenChange={setVoiceSheetOpen}
          orgId={orgId}
          userId={currentUserId}
          categories={categoriesQuery.data ?? []}
          accounts={accountsQuery.data ?? []}
          additionalCards={additionalCardsQuery.data ?? []}
          members={membersQuery.data ?? []}
          profiles={profilesQuery.data ?? []}
        />
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateName("");
            setCreateError("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              placeholder="Ex: Minha Empresa, Casa"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreateWorkspace();
              }}
            />
            {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!createName.trim() || createPending}
              onClick={() => void handleCreateWorkspace()}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renamingOrg} onOpenChange={(open) => !open && setRenamingOrg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRenameWorkspace();
              }}
            />
            {renameError ? <p className="text-sm text-red-600">{renameError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenamingOrg(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!renameValue.trim() || renamePending}
              onClick={() => void handleRenameWorkspace()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkspaceMenu({
  trigger,
  organizations,
  activeOrg,
  onSwitch,
  onRename,
  onCreate,
}: {
  trigger: ReactNode;
  organizations: OrganizationRow[];
  activeOrg: OrganizationRow | null;
  onSwitch: (id: string) => void;
  onRename: (org: OrganizationRow) => void;
  onCreate: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem key={org.id} onSelect={() => onSwitch(org.id)} className="gap-2">
            {org.id === activeOrg?.id ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{org.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {activeOrg?.role === "admin" ? (
          <DropdownMenuItem onSelect={() => onRename(activeOrg)} className="gap-2">
            <Pencil className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Renomear "{activeOrg.name}"</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onCreate} className="gap-2 text-primary focus:text-primary">
          <Plus className="h-3.5 w-3.5 shrink-0" />
          Novo workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
