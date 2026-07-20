import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { QuickAddForm } from "@/components/finance/QuickAddForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { VoiceCaptureFlow } from "@/components/finance/VoiceCaptureFlow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ensureDefaultCategories, learnFromConfirmation } from "@/lib/classification/pipeline";
import {
  fetchAccounts,
  fetchAdditionalCards,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  fetchTransactions,
} from "@/lib/finance/data";
import type { AccountRow, CategoryRow, TxnRow } from "@/lib/finance/types";
import { useActiveOrganization } from "@/lib/supabase/organization";
import { supabase } from "@/lib/supabase/client";

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
  const [heroCollapsed, setHeroCollapsed] = useState(false);

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

  async function handleCategoryChange(txn: TxnRow, categoryId: string) {
    if (!orgId) return;
    await learnFromConfirmation(orgId, txn.id, txn.description, categoryId);
    await queryClient.invalidateQueries({ queryKey: ["transactions", orgId] });
  }

  async function handleDeleteTransaction(txn: TxnRow) {
    if (!orgId) return;
    await supabase.from("transactions").delete().eq("id", txn.id).eq("organization_id", orgId);
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

  return (
    <AppShell
      activeSection="day"
      title="Transações"
      subtitle="Registro por voz, texto ou formulário"
      userEmail={userEmail}
    >
      {!heroCollapsed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200/70 bg-white py-10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.08)]">
          <Button
            type="button"
            size="icon"
            className="h-20 w-20 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
            aria-label="Registrar por voz"
            onClick={() => setVoiceOpen(true)}
          >
            <Mic className="h-8 w-8" />
          </Button>
          <p className="text-sm font-medium text-slate-600">Toque para falar</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 text-muted-foreground"
            onClick={() => setManualOpen(true)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Adicionar manualmente
          </Button>
        </div>
      ) : null}

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
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
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
        onFiltersCollapsedChange={setHeroCollapsed}
      />
    </AppShell>
  );
}
