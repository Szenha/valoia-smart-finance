import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { QuickAddForm } from "@/components/finance/QuickAddForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { ensureDefaultCategories, learnFromConfirmation } from "@/lib/classification/pipeline";
import {
  fetchAccounts,
  fetchHouseholdMembers,
  fetchMemberProfiles,
  fetchTransactions,
} from "@/lib/finance/data";
import type { AccountRow, CategoryRow, TxnRow } from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  head: () => ({ meta: [{ title: "Valoia — Lançamentos" }] }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");

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
      const org = await getOrCreateOrganization();
      setOrgId(org);
      await ensureDefaultCategories(org);
    }
    init();
  }, [navigate]);

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

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
  const transactions = transactionsQuery.data ?? [];

  return (
    <AppShell
      activeSection="day"
      title="Dia a dia"
      subtitle="Registro por voz, texto ou formulário"
      userEmail={userEmail}
      onSignOut={handleSignOut}
    >
      <QuickAddForm orgId={orgId} userId={userId} categories={categories} accounts={accounts} />
      <TransactionList
        transactions={transactions}
        categories={categories}
        members={membersQuery.data ?? []}
        profiles={profilesQuery.data ?? []}
        currentUserId={userId}
        onCategoryChange={handleCategoryChange}
        onDelete={handleDeleteTransaction}
      />
    </AppShell>
  );
}
