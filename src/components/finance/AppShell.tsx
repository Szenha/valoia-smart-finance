import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BadgePercent,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ClipboardCheck,
  CreditCard,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mic,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Settings2,
  Star,
  Tags,
  Target,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { TiclioLogo } from "@/components/brand/ticlio-logo";
import { CommercialGate } from "@/components/finance/CommercialGate";
import { CheckoutReturnBanner } from "@/components/finance/CheckoutReturnBanner";
import { InstallAppBanner } from "@/components/finance/InstallAppBanner";
import { MyPlanDialog } from "@/components/finance/MyPlanDialog";
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
  fetchGoals,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  renameOrganization,
} from "@/lib/finance/data";
import type { OrganizationRow } from "@/lib/finance/types";
import {
  capabilitiesFor,
  effectiveStatus,
  fetchCommercialSubscription,
  normalizeSubscription,
  TICLIO_STAFF_EMAIL,
} from "@/lib/commercial/access";
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
  | "analytics"
  | "comercial";

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
  {
    label: "Comercial",
    to: "/comercial/dashboard",
    icon: BadgePercent,
    section: "comercial",
    children: [
      { label: "Dashboard", to: "/comercial/dashboard", icon: BadgePercent },
      { label: "Clientes", to: "/comercial/clientes", icon: Users },
      { label: "Planos e preços", to: "/comercial/precos", icon: PiggyBank },
      { label: "Códigos promocionais", to: "/comercial/codigos", icon: BadgePercent },
    ],
  },
];

// Mobile é intencionalmente reduzido, não o desktop espremido: só as duas
// seções mais usadas em mobilidade ficam na barra inferior (Início e
// Análises); o resto continua 100% acessível, só agrupado em "Mais".
// Relatórios não precisa entrar em "Mais" — já é alcançável pela
// AnalyticsTabs dentro da própria página de Análises.
const MOBILE_PRIMARY_SECTIONS: Section[] = ["day", "analytics"];

function visibleNavItemsForTrial(items: NavItem[]): NavItem[] {
  return items
    .filter((item) =>
      ["day", "cadastros", "membros", "planejamento", "analytics"].includes(item.section),
    )
    .map((item) => {
      if (item.section !== "planejamento") return item;
      return {
        ...item,
        to: "/planejamento/metas",
        children: item.children?.filter((child) => child.to === "/planejamento/metas"),
      };
    });
}

export function AppShell({ activeSection, title, subtitle, userEmail, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreSectionActive = !MOBILE_PRIMARY_SECTIONS.includes(activeSection);
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
  const subscriptionQuery = useQuery({
    queryKey: ["commercial-subscription", orgId],
    enabled: !!orgId,
    queryFn: () => fetchCommercialSubscription(orgId!),
  });
  const shellSubscription = normalizeSubscription(subscriptionQuery.data);
  const shellCapabilities = capabilitiesFor(shellSubscription);
  const isTrialPlan = shellSubscription.plan_name === "trial";
  const shellStatus = effectiveStatus(shellSubscription);
  const trialDaysLeft = Math.max(
    0,
    Math.ceil((new Date(shellSubscription.trial_ends_at).getTime() - Date.now()) / 86_400_000),
  );
  const isTiclioStaff = loggedInEmail === TICLIO_STAFF_EMAIL;
  const baseNavItems = isTiclioStaff
    ? navItems
    : navItems.filter((item) => item.section !== "comercial");
  const visibleNavItems = isTrialPlan ? visibleNavItemsForTrial(baseNavItems) : baseNavItems;
  const mobilePrimarySections = MOBILE_PRIMARY_SECTIONS;
  const mobileNavItems = visibleNavItems.filter((item) =>
    mobilePrimarySections.includes(item.section),
  );
  const mobileMoreItems = visibleNavItems
    .filter((item) => !mobilePrimarySections.includes(item.section))
    .flatMap((item) => (item.children && item.children.length > 0 ? item.children : [item]));

  const [myPlanOpen, setMyPlanOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [blockedFeature, setBlockedFeature] = useState<string | null>(null);
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

  function requestCreateWorkspace() {
    if (!shellCapabilities.canCreateWorkspace) {
      setBlockedFeature(
        "Workspaces adicionais ficam disponíveis no plano Família. No trial e no plano Individual, o Ticlio mantém um workspace único para reduzir complexidade e risco.",
      );
      return;
    }
    setCreateOpen(true);
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

  async function handleSetPrimaryWorkspace(org: OrganizationRow) {
    try {
      await workspace.setPrimaryWorkspace(org.id);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err));
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
  const goalsQuery = useQuery({
    queryKey: ["goals", orgId],
    enabled: !!orgId,
    queryFn: () => fetchGoals(orgId!),
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
            <div className="flex flex-col items-center gap-1">
              <Link
                to="/"
                aria-label="Início"
                className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <TiclioLogo variant="icon" className="h-10 w-10 rounded-lg" />
              </Link>
              <WorkspaceMenu
                organizations={workspace.organizations}
                activeOrg={activeOrganization}
                onSwitch={workspace.switchOrganization}
                onRename={openRename}
                onSetPrimary={(org) => void handleSetPrimaryWorkspace(org)}
                onCreate={requestCreateWorkspace}
                trigger={
                  <button
                    type="button"
                    aria-label="Trocar workspace"
                    className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                }
              />
            </div>
          ) : (
            <Link to="/" aria-label="Início">
              <TiclioLogo variant="full-on-light" style={{ height: 32, width: "auto" }} />
            </Link>
          )}
        </div>
        {!collapsed ? (
          <WorkspaceMenu
            organizations={workspace.organizations}
            activeOrg={activeOrganization}
            onSwitch={workspace.switchOrganization}
            onRename={openRename}
            onSetPrimary={(org) => void handleSetPrimaryWorkspace(org)}
            onCreate={requestCreateWorkspace}
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
          {visibleNavItems.map((item) => {
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
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                to="/"
                aria-label="Início"
                className="shrink-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <TiclioLogo
                  variant="icon"
                  className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-slate-200"
                />
              </Link>
              <WorkspaceMenu
                organizations={workspace.organizations}
                activeOrg={activeOrganization}
                onSwitch={workspace.switchOrganization}
                onRename={openRename}
                onSetPrimary={(org) => void handleSetPrimaryWorkspace(org)}
                onCreate={requestCreateWorkspace}
                trigger={
                  <button
                    type="button"
                    aria-label="Trocar workspace"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                }
              />
              <div className="min-w-0 pl-1.5">
                <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-slate-950 lg:text-xl">
                  {title}
                </h2>
                {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isTrialPlan && shellStatus === "trial_active" ? (
                <button
                  type="button"
                  onClick={() => setMyPlanOpen(true)}
                  className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 sm:inline-flex"
                >
                  Teste grátis · {trialDaysLeft}d
                </button>
              ) : null}
              {loggedInEmail ? (
                <button
                  type="button"
                  onClick={() => setMyPlanOpen(true)}
                  title={`${loggedInEmail} · Meu plano`}
                  className="hidden max-w-[220px] truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 sm:inline-block"
                >
                  {loggedInEmail}
                </button>
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
          <InstallAppBanner />
          <CheckoutReturnBanner />
          <CommercialGate userId={currentUserId} orgId={orgId}>
            {({ subscription }) => (
              <>
                {subscription.plan_name === "trial" ? (
                  <TrialNextSteps
                    categoriesCount={categoriesQuery.data?.length ?? 0}
                    accountsCount={accountsQuery.data?.length ?? 0}
                    goalsCount={goalsQuery.data?.length ?? 0}
                  />
                ) : null}
                {children}
              </>
            )}
          </CommercialGate>
        </main>
      </div>

      {/* Mobile bottom navigation — reduzida a só o essencial pra mobilidade
          (Início e Análises), diferente da sidebar desktop que mostra as 6
          seções completas. As demais seções (Cadastros, Membros,
          Conciliação, Planejamento, Calendário, Relatórios) continuam
          totalmente acessíveis via "Mais" — nenhuma rota fica escondida,
          só agrupada. O botão central de adicionar é o FAB logo abaixo. */}
      <nav
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex items-stretch gap-1 rounded-full border border-slate-200/70 bg-white/95 p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-10px_rgba(0,0,0,0.18)] backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = item.section === activeSection;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-slate-500",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="truncate px-0.5">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[10px] font-medium transition-colors",
            moreSectionActive ? "text-primary" : "text-slate-500",
          )}
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={moreSectionActive ? 2.5 : 2} />
          <span className="truncate px-0.5">Mais</span>
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Mais</DialogTitle>
          <div className="grid gap-1">
            {mobileMoreItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                    active ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setMyPlanOpen(true);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <CreditCard className="h-4 w-4" />
              Meu plano
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {orgId ? (
        <MyPlanDialog
          open={myPlanOpen}
          onOpenChange={setMyPlanOpen}
          orgId={orgId}
          subscription={shellSubscription}
        />
      ) : null}

      {/* FAB de registrar por voz — mobile only. Vai direto pro microfone
          (ação de maior impulso/velocidade); a escolha entre voz e manual
          com peso igual já é o botão "Adicionar" da tela de Transações. */}
      <Button
        type="button"
        size="icon"
        className="fixed right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 disabled:pointer-events-auto disabled:opacity-50 lg:hidden [bottom:calc(env(safe-area-inset-bottom)+5.5rem)]"
        aria-label="Registrar por voz"
        disabled={!shellCapabilities.canWriteFinancialData}
        title={
          shellCapabilities.canWriteFinancialData
            ? undefined
            : 'Renove seu plano em "Meu plano" para continuar lançando.'
        }
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
          primaryOrgId={workspace.primaryOrgId}
          organizations={workspace.organizations}
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

      <Dialog open={!!blockedFeature} onOpenChange={(open) => !open && setBlockedFeature(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Recurso do plano Família</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{blockedFeature}</p>
          <DialogFooter>
            <Button type="button" onClick={() => setBlockedFeature(null)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TrialNextSteps({
  categoriesCount,
  accountsCount,
  goalsCount,
}: {
  categoriesCount: number;
  accountsCount: number;
  goalsCount: number;
}) {
  const steps = [
    {
      label: "Revisar categorias",
      description: "Ajuste receitas, despesas e subcategorias para o seu jeito de organizar.",
      to: "/cadastros/categorias",
      done: categoriesCount > 0,
    },
    {
      label: "Cadastrar contas e cartões",
      description: "Adicione pelo menos uma conta ou cartão para começar os lançamentos.",
      to: "/cadastros/contas-e-cartoes",
      done: accountsCount > 0,
    },
    {
      label: "Criar uma meta",
      description: "Opcional no beta: acompanhe um objetivo financeiro simples.",
      to: "/planejamento/metas",
      done: goalsCount > 0,
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Próximos passos do trial</p>
          <p className="text-sm text-muted-foreground">
            Configure o básico primeiro. Depois, registre despesas e receitas com menos atrito.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {completed}/{steps.length} concluído(s)
        </span>
      </div>
      <div className="mt-4 grid gap-2 lg:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.to}
            to={step.to}
            className="flex min-h-[92px] gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                step.done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-400",
              )}
            >
              {step.done ? <CheckCircle2 className="h-4 w-4" /> : null}
            </span>
            <span>
              <span className="block font-medium text-slate-900">{step.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {step.description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function WorkspaceMenu({
  trigger,
  organizations,
  activeOrg,
  onSwitch,
  onRename,
  onSetPrimary,
  onCreate,
}: {
  trigger: ReactNode;
  organizations: OrganizationRow[];
  activeOrg: OrganizationRow | null;
  onSwitch: (id: string) => void;
  onRename: (org: OrganizationRow) => void;
  onSetPrimary: (org: OrganizationRow) => void;
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
            {org.is_primary ? (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                Principal
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {activeOrg?.role === "admin" ? (
          <DropdownMenuItem onSelect={() => onRename(activeOrg)} className="gap-2">
            <Pencil className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Renomear "{activeOrg.name}"</span>
          </DropdownMenuItem>
        ) : null}
        {activeOrg && !activeOrg.is_primary ? (
          <DropdownMenuItem onSelect={() => onSetPrimary(activeOrg)} className="gap-2">
            <Star className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Definir "{activeOrg.name}" como principal</span>
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
