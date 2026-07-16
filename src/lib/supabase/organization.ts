import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createOrganization, fetchMyOrganizations } from "@/lib/finance/data";
import type { OrganizationRow } from "@/lib/finance/types";
import { getOrCreateOrganization } from "./auth";

const ACTIVE_ORG_KEY = "ticlio:active-org";

/**
 * Resolves and persists the user's active workspace — one user can belong to
 * several organizations (ex: a solo business + a shared household), so
 * "which one is active" is a per-device choice, not something the backend
 * decides. Replaces the old pattern of every route independently calling
 * `getOrCreateOrganization()` (which silently collapsed the user's real org
 * list down to a single implicit pick, with no way to see or fix a stray
 * duplicate — the bug that hid the household workspace from a member).
 */
export function useActiveOrganization(userId: string | null) {
  const queryClient = useQueryClient();
  const [storedOrgId, setStoredOrgId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStoredOrgId(window.localStorage.getItem(ACTIVE_ORG_KEY));
    setHydrated(true);
  }, []);

  const organizationsQuery = useQuery({
    queryKey: ["my-organizations", userId],
    enabled: !!userId,
    queryFn: () => fetchMyOrganizations(userId!),
  });
  const organizations = organizationsQuery.data ?? [];

  // Rede de segurança pro caso raro da lista vir vazia (não deveria
  // acontecer — o trigger de signup sempre cria um workspace) — só nesse
  // cenário cai no resolvedor antigo, que cria um novo se precisar.
  const fallbackQuery = useQuery({
    queryKey: ["org-fallback", userId],
    enabled: !!userId && organizationsQuery.isSuccess && organizations.length === 0,
    queryFn: getOrCreateOrganization,
  });

  function persistActiveOrgId(id: string) {
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_ORG_KEY, id);
    setStoredOrgId(id);
  }

  const validStoredId =
    storedOrgId && organizations.some((org) => org.id === storedOrgId) ? storedOrgId : null;
  const resolvedOrgId = validStoredId ?? organizations[0]?.id ?? fallbackQuery.data ?? null;

  // A escolha ativa mudou (primeira vez, ou a salva não existe mais nessa
  // lista — ex: foi removido daquele workspace) — grava a nova escolha.
  useEffect(() => {
    if (hydrated && resolvedOrgId && resolvedOrgId !== storedOrgId) {
      persistActiveOrgId(resolvedOrgId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, resolvedOrgId]);

  function switchOrganization(id: string) {
    persistActiveOrgId(id);
  }

  async function createWorkspace(name: string): Promise<string> {
    if (!userId) throw new Error("Não autenticado.");
    const id = await createOrganization(name, userId);
    await queryClient.invalidateQueries({ queryKey: ["my-organizations", userId] });
    persistActiveOrgId(id);
    return id;
  }

  return {
    orgId: hydrated ? resolvedOrgId : null,
    organizations: organizations as OrganizationRow[],
    isLoading: !hydrated || organizationsQuery.isLoading,
    switchOrganization,
    createWorkspace,
    refetchOrganizations: organizationsQuery.refetch,
  };
}
