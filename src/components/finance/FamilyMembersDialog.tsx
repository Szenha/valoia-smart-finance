import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberAvatar } from "@/components/finance/MemberAvatar";
import { archiveFamilyMember, createFamilyMember, updateFamilyMember } from "@/lib/finance/data";
import { MEMBER_COLOR_PALETTE, nextAvailableColor } from "@/lib/finance/member-visuals";
import type { FamilyMemberRow } from "@/lib/finance/types";

type Props = {
  orgId: string;
  familyMembers: FamilyMemberRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** CRUD dos "Membros do grupo" do Calendário — de propósito separado de
 *  Cadastros > Membros (que são usuários com login no workspace). Um membro
 *  do grupo aqui é só nome + cor, sem exigir conta — o app não é só pra
 *  família, qualquer grupo compartilhando finanças pode usar. */
export function FamilyMembersDialog({ orgId, familyMembers, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setName("");
    setColor(nextAvailableColor(familyMembers.map((m) => m.color)));
  }, [open, familyMembers]);

  function startEdit(member: FamilyMemberRow) {
    setEditingId(member.id);
    setName(member.name);
    setColor(member.color);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setColor(nextAvailableColor(familyMembers.map((m) => m.color)));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Dê um nome ao membro.");
      if (editingId) await updateFamilyMember(editingId, { name: name.trim(), color });
      else await createFamilyMember(orgId, { name: name.trim(), color });
    },
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["family-members", orgId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (member: FamilyMemberRow) => {
      const ok = await confirm({
        title: "Remover membro do grupo",
        description: `Remover "${member.name}"? Compromissos já criados para essa pessoa continuam existindo, mas sem cor/nome associado.`,
        confirmLabel: "Remover",
        destructive: true,
      });
      if (!ok) return;
      await archiveFamilyMember(member.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["family-members", orgId] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Membros do grupo</DialogTitle>
          <DialogDescription>
            Quem aparece no Calendário — não precisa ter login no Ticlio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {familyMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-sm"
            >
              <div className="flex items-center gap-2.5">
                <MemberAvatar name={member.name} color={member.color} />
                <span>{member.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Editar membro"
                  onClick={() => startEdit(member)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600 hover:text-red-700"
                  aria-label="Remover membro"
                  disabled={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate(member)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {familyMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum membro cadastrado ainda. Adicione abaixo.
            </p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-3">
          <p className="text-sm font-medium">{editingId ? "Editar membro" : "Novo membro"}</p>
          <div>
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Bia, Samuel"
            />
          </div>
          <div>
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
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
            {editingId ? (
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            ) : null}
          </div>
          {saveMutation.error ? (
            <p className="text-sm text-red-600">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : String(saveMutation.error)}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
