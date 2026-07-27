import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryPath } from "@/lib/finance/categories";
import type { PostSaveInsight } from "@/lib/finance/post-save-insight";
import type { SavedConfirmation } from "./useQuickAddForm";
import { paymentMethodLabel, type PaymentMethod } from "@/lib/finance/transactionIcons";
import { formatCurrency, type CategoryRow } from "@/lib/finance/types";

const INSIGHT_ICON: Record<PostSaveInsight["kind"], typeof Info> = {
  budget_over: AlertTriangle,
  budget_near: AlertTriangle,
  spent_today: Info,
  spent_week: Info,
};

/**
 * Confirmação depois do lançamento já ter sido persistido — reflete a linha
 * que realmente foi salva (não os valores originalmente extraídos pela IA).
 * No máximo um insight (post-save-insight.ts já escolhe qual), nunca vários.
 * "Desfazer" só aparece quando é seguro: uma parcela de um plano de
 * parcelamento não pode ser apagada sozinha sem deixar as demais órfãs.
 */
export function PostSaveConfirmation({
  confirmation,
  categories,
  onClose,
  onUndo,
  undoing,
}: {
  confirmation: SavedConfirmation;
  categories: CategoryRow[];
  onClose: () => void;
  onUndo?: () => void;
  undoing?: boolean;
}) {
  const { transaction, insight } = confirmation;
  const isExpense = transaction.amount < 0;
  const kindLabel = isExpense ? "Despesa registrada" : "Receita registrada";
  const category = categoryPath(categories, transaction.category_id);
  const method = paymentMethodLabel[transaction.payment_method as PaymentMethod];
  const canUndo = !!onUndo && !transaction.installment_plan_id;
  const InsightIcon = insight ? INSIGHT_ICON[insight.kind] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{kindLabel}</p>
          <p className="text-sm text-slate-600">
            {formatCurrency(Math.abs(transaction.amount))} em {category}
            {method ? `, pago via ${method}` : ""}.
          </p>
        </div>
      </div>

      {insight ? (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          {InsightIcon ? (
            <InsightIcon
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                insight.kind === "budget_over" || insight.kind === "budget_near"
                  ? "text-amber-600"
                  : "text-slate-400"
              }`}
            />
          ) : null}
          <p>{insight.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" asChild variant="outline" size="sm" onClick={onClose}>
          <Link to="/">Ver lançamento</Link>
        </Button>
        {canUndo ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={undoing}
            onClick={onUndo}
            className="text-red-700 hover:bg-red-50 hover:text-red-800"
          >
            Desfazer
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
