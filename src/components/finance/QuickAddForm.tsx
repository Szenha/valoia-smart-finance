import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AccountRow,
  AdditionalCardRow,
  CategoryRow,
  HouseholdMemberRow,
  ProfileRow,
} from "@/lib/finance/types";
import { QuickAddFields } from "./QuickAddFields";
import { useQuickAddForm } from "./useQuickAddForm";

type Props = {
  orgId: string;
  userId: string | null;
  categories: CategoryRow[];
  accounts: AccountRow[];
  additionalCards?: AdditionalCardRow[];
  members?: HouseholdMemberRow[];
  profiles?: ProfileRow[];
  /** Focus the voice/text field on mount — used when opened from the mobile FAB sheet. */
  autoFocusInput?: boolean;
  /** Called after a successful save — used by the FAB sheet to close itself. */
  onSaved?: () => void;
  /** Skip the outer Card chrome when embedded in another container (e.g. a Drawer). */
  bare?: boolean;
};

/** The deliberate full manual-entry form — "Adicionar manualmente" and the
 *  "Editar" step of VoiceCaptureFlow reuse the same field set via
 *  QuickAddFields, but this component is the standalone entry point. */
export function QuickAddForm({
  orgId,
  userId,
  categories,
  accounts,
  additionalCards,
  members,
  profiles,
  autoFocusInput,
  onSaved,
  bare,
}: Props) {
  const api = useQuickAddForm({
    orgId,
    userId,
    categories,
    accounts,
    additionalCards,
    members,
    profiles,
    onSaved,
  });

  const formContent = (
    <form
      onSubmit={api.form.handleSubmit((values) => api.saveMutation.mutate(values))}
      className="grid gap-4"
    >
      <QuickAddFields api={api} autoFocusInput={autoFocusInput} />
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={api.saveMutation.isPending}>
          Salvar lançamento
        </Button>
        {api.status && <p className="text-sm text-muted-foreground">{api.status}</p>}
      </div>
    </form>
  );

  if (bare) {
    return formContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lançamento rápido</CardTitle>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
