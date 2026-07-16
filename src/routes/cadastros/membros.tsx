import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import {
  addHouseholdMember,
  fetchHouseholdMembers,
  fetchOrganizationOwner,
  findHouseholdCandidate,
  fetchMemberProfiles,
  removeHouseholdMember,
  updateHouseholdMember,
} from "@/lib/finance/data";
import {
  MEMBER_COLOR_PALETTE,
  nextAvailableColor,
  resolveMemberColor,
  resolveMemberName,
} from "@/lib/finance/member-visuals";
import type { HouseholdMemberRow } from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/cadastros/membros")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Ticlio — Membros" }] }),
  component: MembrosRoute,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  colaborador: "Colaborador",
  visualizador: "Visualizador",
};

function MembrosRoute() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const orgQuery = useQuery({ queryKey: ["org"], queryFn: getOrCreateOrganization });
  const orgId = orgQuery.data;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

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
  const ownerQuery = useQuery({
    queryKey: ["org-owner", orgId],
    enabled: !!orgId,
    queryFn: () => fetchOrganizationOwner(orgId!),
  });

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [role, setRole] = useState("colaborador");
  const [formError, setFormError] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingUserId && membersQuery.data && !color) {
      setColor(nextAvailableColor(membersQuery.data.map((m) => m.color)));
    }
  }, [membersQuery.data, editingUserId, color]);

  function resetForm() {
    setEditingUserId(null);
    setEmail("");
    setName("");
    setColor(nextAvailableColor((membersQuery.data ?? []).map((m) => m.color)));
    setRole("colaborador");
    setFormError("");
  }

  function startEdit(member: HouseholdMemberRow) {
    setEditingUserId(member.user_id);
    setEmail("");
    setName(member.display_name ?? "");
    setColor(resolveMemberColor(member.user_id, member.color));
    setRole(member.role);
    setFormError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const addMember = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const candidate = await findHouseholdCandidate(orgId, email);
      if (!candidate) {
        throw new Error("Usuário não encontrado ou você não tem permissão para adicioná-lo.");
      }
      await addHouseholdMember(
        orgId,
        candidate.user_id,
        role,
        currentUserId,
        name || null,
        color || null,
      );
    },
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["household-members", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["member-profiles", orgId] });
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : String(err)),
  });

  const editMember = useMutation({
    mutationFn: async () => {
      if (!orgId || !editingUserId) return;
      await updateHouseholdMember(orgId, editingUserId, {
        role,
        displayName: name || null,
        color: color || null,
      });
    },
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["household-members", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["member-profiles", orgId] });
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : String(err)),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!orgId) return;
      await removeHouseholdMember(orgId, userId);
    },
    onSuccess: async () => {
      setRemoveError("");
      await queryClient.invalidateQueries({ queryKey: ["household-members", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["member-profiles", orgId] });
    },
    onError: (err) => setRemoveError(err instanceof Error ? err.message : String(err)),
  });

  // Wait for the owner lookup too, not just orgId — removeBlockedReason must
  // never render a "Remover" button before it actually knows who the owner
  // is (that window used to let anyone, including the owner themselves, be
  // removed by mistake since `userId === undefined` is never true).
  if (!orgId || ownerQuery.isLoading) {
    return <div className="p-5 text-muted-foreground">Carregando…</div>;
  }

  const members = membersQuery.data ?? [];
  const profileById = new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile]));
  const isAdmin = members.find((member) => member.user_id === currentUserId)?.role === "admin";
  const adminCount = members.filter((member) => member.role === "admin").length;
  const ownerId = ownerQuery.data;

  function removeBlockedReason(userId: string, role: string): string | null {
    if (!ownerId) return "Não foi possível confirmar o dono da organização.";
    if (userId === ownerId) return "Não é possível remover o dono da organização.";
    if (role === "admin" && adminCount <= 1) {
      return "Não é possível remover o único administrador.";
    }
    return null;
  }

  async function handleRemove(userId: string, role: string) {
    const blocked = removeBlockedReason(userId, role);
    if (blocked) {
      setRemoveError(blocked);
      return;
    }
    const ok = await confirm({
      title: "Remover membro",
      description: "Remover este membro da família?",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    removeMember.mutate(userId);
  }

  return (
    <AppShell activeSection="membros" title="Membros" subtitle="Quem faz parte da sua família">
      <Card>
        <CardHeader>
          <CardTitle>Membros da família</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => {
            const resolvedName = resolveMemberName(
              member,
              profileById.get(member.user_id),
              member.user_id,
            );
            const resolvedColor = resolveMemberColor(member.user_id, member.color);
            return (
              <div
                key={member.user_id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <MemberAvatar name={resolvedName} color={resolvedColor} />
                  <span>{member.user_id === currentUserId ? "Eu" : resolvedName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {ROLE_LABEL[member.role] ?? member.role}
                  </span>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(member)}
                    >
                      Editar
                    </Button>
                  ) : null}
                  {isAdmin && !removeBlockedReason(member.user_id, member.role) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      disabled={removeMember.isPending}
                      onClick={() => handleRemove(member.user_id, member.role)}
                    >
                      Remover
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {removeError ? <p className="text-sm text-red-600">{removeError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingUserId ? "Editar membro" : "Adicionar membro"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <div className="grid gap-3 md:grid-cols-3">
              {editingUserId ? null : (
                <div className="md:col-span-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="pessoa@exemplo.com"
                  />
                </div>
              )}
              <div className={editingUserId ? "md:col-span-2" : ""}>
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como esse membro aparece nos lançamentos"
                />
              </div>
              <div>
                <Label>Papel</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="colaborador">Colaborador</SelectItem>
                    <SelectItem value="visualizador">Visualizador</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Label>Cor</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {MEMBER_COLOR_PALETTE.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`Cor ${swatch}`}
                      onClick={() => setColor(swatch)}
                      className="h-8 w-8 rounded-full ring-offset-2 transition-shadow"
                      style={{
                        backgroundColor: swatch,
                        boxShadow: color === swatch ? `0 0 0 2px ${swatch}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 md:col-span-3">
                {editingUserId ? (
                  <>
                    <Button onClick={() => editMember.mutate()} disabled={editMember.isPending}>
                      Salvar
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => addMember.mutate()}
                    disabled={!email || addMember.isPending}
                  >
                    Adicionar
                  </Button>
                )}
              </div>
              {formError ? <p className="md:col-span-3 text-sm text-red-600">{formError}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Somente administradores podem adicionar membros.
            </p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
