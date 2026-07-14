import {
  Banknote,
  CreditCard,
  FileText,
  HelpCircle,
  Mic,
  PenLine,
  QrCode,
  Upload,
  type LucideIcon,
} from "lucide-react";
export type PaymentMethod = "debit" | "credit_card" | "pix" | "other";
export type EntrySource = "manual" | "voice_ai" | "ofx_import" | "pdf_import";

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  debit: "Débito",
  credit_card: "Cartão de crédito",
  pix: "Pix",
  other: "Outro",
};

const PAYMENT_METHOD_ICON: Record<PaymentMethod, LucideIcon> = {
  debit: Banknote,
  credit_card: CreditCard,
  pix: QrCode,
  other: HelpCircle,
};

export function paymentMethodIcon(method: string): LucideIcon {
  return PAYMENT_METHOD_ICON[method as PaymentMethod] ?? HelpCircle;
}

export const entrySourceLabel: Record<EntrySource, string> = {
  manual: "Manual",
  voice_ai: "Voz/IA",
  ofx_import: "Importado (OFX)",
  pdf_import: "Importado (PDF)",
};

const ENTRY_SOURCE_ICON: Record<EntrySource, LucideIcon> = {
  manual: PenLine,
  voice_ai: Mic,
  ofx_import: Upload,
  pdf_import: FileText,
};

export function entrySourceIcon(source: string): LucideIcon {
  return ENTRY_SOURCE_ICON[source as EntrySource] ?? PenLine;
}

/** checking accounts are ambiguous (debit or pix) and left to the user;
 *  credit_card/investment have one obvious payment method each. */
export function defaultPaymentMethod(accountKind: string): PaymentMethod {
  if (accountKind === "credit_card") return "credit_card";
  if (accountKind === "investment") return "other";
  return "debit";
}

export const INDICATOR_ICON_SIZE_CLASS = "h-3.5 w-3.5";
export const INDICATOR_GAP_CLASS = "gap-1.5";
