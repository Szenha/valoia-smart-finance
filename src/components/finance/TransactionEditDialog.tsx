import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AccountRow, CategoryRow, TxnRow } from "@/lib/finance/types";
import { QuickAddFields } from "./QuickAddFields";
import { useQuickAddForm, type QuickAddFormValues } from "./useQuickAddForm";

type Props = {
  transaction: TxnRow;
  orgId: string;
  userId: string | null;
  categories: CategoryRow[];
  accounts: AccountRow[];
  onClose: () => void;
};

function transactionTypeOf(transaction: TxnRow): QuickAddFormValues["transaction_type"] {
  if (transaction.type.includes("TRANSFER")) return "transfer";
  return transaction.amount >= 0 ? "income" : "expense";
}

/** Full edit — every field, not just category — for a single existing
 *  transaction. Reuses the same QuickAddFields/useQuickAddForm plumbing as
 *  the voice flow's "Editar" step, just pointed at an update instead of an
 *  insert. Only rendered when the caller already knows the current user can
 *  manage this transaction (ownership is still enforced server-side by RLS
 *  regardless). */
export function TransactionEditDialog({
  transaction,
  orgId,
  userId,
  categories,
  accounts,
  onClose,
}: Props) {
  const api = useQuickAddForm({
    orgId,
    userId,
    categories,
    accounts,
    editingTransactionId: transaction.id,
    initialValues: {
      transaction_type: transactionTypeOf(transaction),
      amount: Math.abs(transaction.amount),
      description: transaction.description,
      category_id: transaction.category_id ?? "",
      posted_at: transaction.posted_at.slice(0, 10),
      account_id: transaction.account_id,
      account_kind: (transaction.account_kind as QuickAddFormValues["account_kind"]) ?? "checking",
      payment_method: transaction.payment_method as QuickAddFormValues["payment_method"],
      installments_count: 1,
      original_text: transaction.original_text ?? "",
    },
    onSaved: onClose,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogTitle>Editar lançamento</DialogTitle>
        <QuickAddFields api={api} hideRecordButton />
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={api.saveMutation.isPending}
            onClick={() => api.saveMutation.mutate(api.form.getValues())}
          >
            Salvar
          </Button>
        </div>
        {api.saveMutation.error ? (
          <p className="text-sm text-red-600">
            {api.saveMutation.error instanceof Error
              ? api.saveMutation.error.message
              : String(api.saveMutation.error)}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
