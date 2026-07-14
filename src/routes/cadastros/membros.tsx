import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/finance/AppShell";
import { CadastrosTabs } from "@/components/finance/CadastrosTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addHouseholdMember,
  fetchHouseholdMembers,
  findHouseholdCandidate,
  fetchMemberProfiles,
} from "@/lib/finance/data";
import { memberDisplayName } from "@/lib/finance/types";
import { getOrCreateOrganization } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/cadastros/membros")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/landing" });
  },
  component: MembrosRoute,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  colaborador: "Colaborador",
  visualizador: "Visualizador",
};

function MembrosRoute() {
  const queryClient = useQueryClient();
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

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("colaborador");
  const [formError, setFormError] = useState("");

  const addMember = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const candidate = await findHouseholdCandidate(orgId, email);
      if (!candidate) {
        throw new Error("Usuário não encontrado ou você não tem permissão para adicioná-lo.");
      }
      await addHouseholdMember(orgId, candidate.user_id, role, currentUserId);
    },
    onSuccess: async () => {
      setEmail("");
      setFormError("");
      await queryClient.invalidateQueries({ queryKey: ["household-members", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["member-profiles", orgId] });
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : String(err)),
  });

  if (!orgId) return <div className="p-5 text-muted-foreground">Carregando…</div>;

  const members = membersQuery.data ?? [];
  const profileById = new Map((profilesQuery.data ?? []).map((profile) => [profile.id, profile]));
  const isAdmin = members.find((member) => member.user_id === currentUserId)?.role === "admin";

  return (
    <AppShell activeSection="cadastros" title="Membros" subtitle="Quem faz parte do seu household">
      <CadastrosTabs value="membros" />
      <Card>
        <CardHeader>
          <CardTitle>Membros do household</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"
            >
              <span>
                {member.user_id === currentUserId
                  ? "Eu"
                  : memberDisplayName(profileById.get(member.user_id), member.user_id)}
              </span>
              <span className="text-muted-foreground">
                {ROLE_LABEL[member.role] ?? member.role}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar membro</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="pessoa@exemplo.com"
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
              <Button
                className="md:col-span-3"
                onClick={() => addMember.mutate()}
                disabled={!email || addMember.isPending}
              >
                Adicionar
              </Button>
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
