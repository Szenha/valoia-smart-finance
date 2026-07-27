import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AddEntryChooser } from "@/components/finance/AddEntryChooser";
import { AppShell } from "@/components/finance/AppShell";
import { MobileHome } from "@/components/finance/MobileHome";
import { QuickAddForm } from "@/components/finance/QuickAddForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { VoiceCaptureFlow } from "@/components/finance/VoiceCaptureFlow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ensureDefaultCategories, learnFromConfirmation } from "@/lib/classification/pipeline";
import {
  ensureRecurringBillOccurrences,
  fetchAccounts,
  fetchAdditionalCards,
  fetchDashboardMonthSummary,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  fetchRecurringBillsUpcoming,
  fetchTransactions,
} from "@/lib/finance/data";
import { addDaysToDateOnly, localToday } from "@/lib/finance/date-utils";
import {
  memberDisplayName,
  type AccountRow,
  type CategoryRow,
  type TxnRow,
} from "@/lib/finance/types";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";

const UPCOMING_BILLS_WINDOW_DAYS = 7;

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Transações" }] }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/login" });
        return;
      }
      setUserId(user.id);
      setUserEmail(user.email ?? "");
    }
    init();
  }, [navigate]);

  const { orgId } = useActiveOrganization(userId);

  // ensureDefaultCategories é idempotente e roda toda vez que o workspace
  // ativo muda (inclusive um workspace recém-criado no seletor), garantindo
  // a árvore de categorias padrão sem depender de um passo de "signup".
  const categoriesQuery = useQuery({
    queryKey: ["categories", orgId],
    enabled: !!orgId,
    queryFn: async () => ensureDefaultCategories(orgId!),
  });

  const transactionsQuery = useQuery({
    queryKey: ["transactions", orgId],
    enabled: !!orgId,
    queryFn: () => fetchTransactions(orgId!),
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

  // Dados do resumo inicial mobile (MobileHome) — mesma RPC/consulta já
  // usada no Dashboard, sem duplicar lógica de cálculo.
  const monthSummaryQuery = useQuery({
    queryKey: ["dashboard-summary", orgId],
    enabled: !!orgId,
    queryFn: () => fetchDashboardMonthSummary(orgId!),
  });
  const upcomingBillsQuery = useQuery({
    queryKey: ["mobile-home-upcoming-bills", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const start = localToday();
      const end = addDaysToDateOnly(start, UPCOMING_BILLS_WINDOW_DAYS);
      await ensureRecurringBillOccurrences(orgId!, end);
      return fetchRecurringBillsUpcoming(orgId!, start, end);
    },
  });

  async function handleCategoryChange(txn: TxnRow, categoryId: string) {
    if (!orgId) return;
    await learnFromConfirmation(orgId, txn.id, txn.description, categoryId);
    await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
  }

  async function handleDeleteTransaction(txn: TxnRow) {
    if (!orgId) return;
    // Transferência é sempre um par de linhas ligadas por transfer_group_id
    // (débito na origem, crédito no destino) — excluir só uma deixaria a
    // outra ponta órfã, com um valor que nunca existiu isoladamente.
    if (txn.transfer_group_id) {
      await supabase
        .from("transactions")
        .delete()
        .eq("transfer_group_id", txn.transfer_group_id)
        .eq("organization_id", orgId);
    } else {
      await supabase.from("transactions").delete().eq("id", txn.id).eq("organization_id", orgId);
    }
    await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
  }

  if (!orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const categories = (categoriesQuery.data ?? []) as CategoryRow[];
  const accounts = (accountsQuery.data ?? []) as AccountRow[];
  const additionalCards = additionalCardsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const currentProfile = profilesQuery.data?.find((profile) => profile.id === userId);
  const displayName = currentProfile
    ? memberDisplayName(currentProfile, userId ?? "")
    : userEmail || "";

  return (
    <AppShell
      activeSection="day"
      title="Transações"
      subtitle="Registro por voz, texto ou formulário"
      userEmail={userEmail}
    >
      {displayName ? (
        <MobileHome
          displayName={displayName}
          summary={monthSummaryQuery.data}
          transactions={transactions}
          upcomingBills={upcomingBillsQuery.data ?? []}
          today={localToday()}
        />
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={() => setChooserOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <AddEntryChooser
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        onChooseVoice={() => {
          setChooserOpen(false);
          setVoiceOpen(true);
        }}
        onChooseManual={() => {
          setChooserOpen(false);
          setManualOpen(true);
        }}
      />

      <VoiceCaptureFlow
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        orgId={orgId}
        userId={userId}
        categories={categories}
        accounts={accounts}
        additionalCards={additionalCards}
        members={membersQuery.data ?? []}
        profiles={profilesQuery.data ?? []}
      />

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogTitle>Lançamento manual</DialogTitle>
          <QuickAddForm
            bare
            orgId={orgId}
            userId={userId}
            categories={categories}
            accounts={accounts}
            additionalCards={additionalCards}
            members={membersQuery.data ?? []}
            profiles={profilesQuery.data ?? []}
            onSaved={() => setManualOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <TransactionList
        orgId={orgId}
        transactions={transactions}
        categories={categories}
        accounts={accounts}
        additionalCards={additionalCards}
        members={membersQuery.data ?? []}
        profiles={profilesQuery.data ?? []}
        currentUserId={userId}
        onCategoryChange={handleCategoryChange}
        onDelete={handleDeleteTransaction}
      />
    </AppShell>
  );
}
