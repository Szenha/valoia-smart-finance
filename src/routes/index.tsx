import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/finance/AppNav";
import { QuickAddForm } from "@/components/finance/QuickAddForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { ensureDefaultCategories, learnFromConfirmation } from "@/lib/classification/pipeline";
import { fetchAccounts, fetchTransactions } from "@/lib/finance/data";
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
  head: () => ({ meta: [{ title: "Calcum — Lançamentos" }] }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  async function handleCategoryChange(txn: TxnRow, categoryId: string) {
    if (!orgId) return;
    await learnFromConfirmation(orgId, txn.id, txn.description, categoryId);
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
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">
            Registro do dia a dia por texto, voz ou formulário
          </p>
          <p className="text-sm text-muted-foreground">{userEmail}</p>
        </div>
        <AppNav onSignOut={handleSignOut} />
      </header>

      <QuickAddForm orgId={orgId} categories={categories} accounts={accounts} />
      <TransactionList
        transactions={transactions}
        categories={categories}
        onCategoryChange={handleCategoryChange}
      />
    </main>
  );
}
