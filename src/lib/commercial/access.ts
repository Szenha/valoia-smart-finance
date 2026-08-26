import { supabase } from "@/lib/supabase/client";

export const TERMS_VERSION = "2026-08-25";
export const PRIVACY_VERSION = "2026-08-25";
export const AI_NOTICE_VERSION = "2026-08-25";

// Único e-mail com acesso ao backoffice Comercial. A proteção de verdade é
// a RLS/RPC (is_ticlio_staff() no banco) — isto aqui só evita renderizar o
// menu/telas pra quem nunca vai conseguir usá-las.
export const TICLIO_STAFF_EMAIL = "szenha30@gmail.com";

export type PlanName = "trial" | "individual" | "family" | "internal";
export type BillingCycle = "monthly" | "annual";
export type PaymentMethod = "pix" | "credit_card";
export type SubscriptionStatus =
  | "trial_active"
  | "trial_expired"
  | "awaiting_pix_confirmation"
  | "active_paid"
  | "payment_overdue"
  | "blocked_readonly"
  | "cancelled";

export type CommercialSubscription = {
  organization_id: string;
  owner_user_id: string;
  plan_name: PlanName;
  status: SubscriptionStatus;
  trial_started_at: string;
  trial_ends_at: string;
  paid_until: string | null;
  amount_cents?: number | null;
  base_amount_cents?: number | null;
  discount_amount_cents?: number | null;
  promo_code?: string | null;
  discount_percent?: number | null;
  billing_cycle?: BillingCycle | null;
  payment_method?: PaymentMethod | null;
  cancelled_at?: string | null;
  next_due_date?: string | null;
};

export type LegalAcceptance = {
  user_id: string;
  terms_version: string;
  privacy_version: string;
  ai_notice_version: string;
  accepted_at: string;
};

export type PlanCapabilities = {
  maxWorkspaces: number;
  maxMembersPerWorkspace: number;
  canInviteMembers: boolean;
  canCreateWorkspace: boolean;
  canUseVoice: boolean;
  canUseAiCategorization: boolean;
  canUseImport: boolean;
  canUseExpenseSplit: boolean;
  canWriteFinancialData: boolean;
  // Disponíveis em qualquer plano pago (individual ou família) — só ficam
  // de fora durante o trial, que mostra uma prévia reduzida do produto.
  canUseCalendar: boolean;
  canUseBudgetPlanning: boolean;
  canUseFixedBills: boolean;
};

export type PromoCode = {
  id: string;
  organization_id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  applies_to_plan: "individual" | "family";
  annual_price_cents: number | null;
  active: boolean;
  valid_until: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  created_by: string | null;
};

export type PromoCodeInput = {
  id?: string;
  organizationId: string;
  code: string;
  description: string | null;
  discountPercent: number;
  appliesToPlan: "individual" | "family";
  active: boolean;
  validUntil: string | null;
  maxRedemptions: number | null;
  createdBy: string;
};

export type CommercialPricing = {
  billing_cycle: BillingCycle;
  price_cents: number;
  active: boolean;
  updated_at: string;
};

export type AdminCustomerRow = {
  organization_id: string;
  organization_name: string;
  owner_email: string;
  plan_name: PlanName;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle | null;
  payment_method: PaymentMethod | null;
  trial_started_at: string;
  trial_ends_at: string;
  paid_until: string | null;
  next_due_date: string | null;
  amount_cents: number | null;
  base_amount_cents: number | null;
  discount_amount_cents: number | null;
  promo_code: string | null;
  discount_percent: number | null;
  cancelled_at: string | null;
  created_at: string;
};

export type AppliedPromoCode = {
  code: string;
  discount_percent: number;
  base_amount_cents: number;
  discount_amount_cents: number;
  final_amount_cents: number;
};

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial_active: "Teste grátis",
  trial_expired: "Teste expirado",
  awaiting_pix_confirmation: "Aguardando confirmação de pagamento",
  active_paid: "Assinatura ativa",
  payment_overdue: "Pagamento atrasado",
  blocked_readonly: "Acesso bloqueado (somente leitura)",
  cancelled: "Cancelada",
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Mensal",
  annual: "Anual",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  credit_card: "Cartão",
};

export const PLAN_CAPABILITIES: Record<PlanName, PlanCapabilities> = {
  trial: {
    maxWorkspaces: 1,
    maxMembersPerWorkspace: 1,
    canInviteMembers: false,
    canCreateWorkspace: false,
    canUseVoice: true,
    canUseAiCategorization: true,
    canUseImport: false,
    canUseExpenseSplit: false,
    canWriteFinancialData: true,
    canUseCalendar: false,
    canUseBudgetPlanning: false,
    canUseFixedBills: false,
  },
  individual: {
    maxWorkspaces: 1,
    maxMembersPerWorkspace: 1,
    canInviteMembers: false,
    canCreateWorkspace: false,
    canUseVoice: true,
    canUseAiCategorization: true,
    canUseImport: false,
    canUseExpenseSplit: false,
    canWriteFinancialData: true,
    canUseCalendar: true,
    canUseBudgetPlanning: true,
    canUseFixedBills: true,
  },
  family: {
    maxWorkspaces: 3,
    maxMembersPerWorkspace: 5,
    canInviteMembers: true,
    canCreateWorkspace: true,
    canUseVoice: true,
    canUseAiCategorization: true,
    canUseImport: true,
    canUseExpenseSplit: true,
    canWriteFinancialData: true,
    canUseCalendar: true,
    canUseBudgetPlanning: true,
    canUseFixedBills: true,
  },
  internal: {
    maxWorkspaces: 10,
    maxMembersPerWorkspace: 10,
    canInviteMembers: true,
    canCreateWorkspace: true,
    canUseVoice: true,
    canUseAiCategorization: true,
    canUseImport: true,
    canUseExpenseSplit: true,
    canWriteFinancialData: true,
    canUseCalendar: true,
    canUseBudgetPlanning: true,
    canUseFixedBills: true,
  },
};

export function normalizeSubscription(
  subscription: CommercialSubscription | null | undefined,
): CommercialSubscription {
  if (subscription) return subscription;
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    organization_id: "",
    owner_user_id: "",
    plan_name: "trial",
    status: "trial_active",
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
    paid_until: null,
    amount_cents: null,
    base_amount_cents: null,
    discount_amount_cents: null,
    promo_code: null,
    discount_percent: null,
  };
}

export function effectiveStatus(subscription: CommercialSubscription): SubscriptionStatus {
  if (subscription.status === "trial_active" && new Date(subscription.trial_ends_at) < new Date()) {
    return "trial_expired";
  }
  if (
    subscription.status === "active_paid" &&
    subscription.paid_until &&
    new Date(subscription.paid_until) < new Date()
  ) {
    return "payment_overdue";
  }
  return subscription.status;
}

// Mesma lógica de effectiveStatus(), mas pro formato de linha que vem de
// admin_list_customers() — usada pelo painel Comercial pra não depender de
// um "status" gravado que pode estar desatualizado (vencimento é por tempo).
export function effectiveAdminStatus(row: {
  status: SubscriptionStatus;
  trial_ends_at: string;
  paid_until: string | null;
}): SubscriptionStatus {
  if (row.status === "trial_active" && new Date(row.trial_ends_at) < new Date()) {
    return "trial_expired";
  }
  if (row.status === "active_paid" && row.paid_until && new Date(row.paid_until) < new Date()) {
    return "payment_overdue";
  }
  return row.status;
}

export function capabilitiesFor(subscription: CommercialSubscription): PlanCapabilities {
  const status = effectiveStatus(subscription);
  const base = PLAN_CAPABILITIES[subscription.plan_name] ?? PLAN_CAPABILITIES.trial;
  if (
    status === "trial_expired" ||
    status === "payment_overdue" ||
    status === "blocked_readonly" ||
    status === "cancelled"
  ) {
    return {
      ...base,
      canInviteMembers: false,
      canCreateWorkspace: false,
      canUseVoice: false,
      canUseAiCategorization: false,
      canUseImport: false,
      canUseExpenseSplit: false,
      canWriteFinancialData: false,
      canUseCalendar: false,
      canUseBudgetPlanning: false,
      canUseFixedBills: false,
    };
  }
  if (status === "awaiting_pix_confirmation") {
    return { ...base, canInviteMembers: false, canCreateWorkspace: false };
  }
  return base;
}

export function needsLegalAcceptance(acceptance: LegalAcceptance | null | undefined): boolean {
  return (
    !acceptance ||
    acceptance.terms_version !== TERMS_VERSION ||
    acceptance.privacy_version !== PRIVACY_VERSION ||
    acceptance.ai_notice_version !== AI_NOTICE_VERSION
  );
}

export async function fetchCommercialSubscription(
  orgId: string,
): Promise<CommercialSubscription | null> {
  const { data, error } = await supabase
    .from("commercial_subscriptions")
    .select(
      "organization_id, owner_user_id, plan_name, status, trial_started_at, trial_ends_at, paid_until, amount_cents, base_amount_cents, discount_amount_cents, promo_code, discount_percent, billing_cycle, payment_method, cancelled_at, next_due_date",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CommercialSubscription | null;
}

export async function fetchCommercialPricing(): Promise<CommercialPricing[]> {
  const { data, error } = await supabase
    .from("commercial_pricing")
    .select("billing_cycle, price_cents, active, updated_at")
    .order("billing_cycle", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CommercialPricing[];
}

export async function updateCommercialPricing(
  billingCycle: BillingCycle,
  priceCents: number,
  active: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("commercial_pricing")
    .update({ price_cents: priceCents, active, updated_at: new Date().toISOString() })
    .eq("billing_cycle", billingCycle);
  if (error) throw new Error(error.message);
}

export async function fetchAdminCustomers(): Promise<AdminCustomerRow[]> {
  const { data, error } = await supabase.rpc("admin_list_customers");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminCustomerRow[];
}

export type AdminMetrics = {
  trialsActive: number;
  trialsEndingSoon: number;
  trialsExpired: number;
  customersActive: number;
  conversionPercent: number;
  mrrCents: number;
  overdue: number;
  cancelled: number;
};

export function computeAdminMetrics(rows: AdminCustomerRow[]): AdminMetrics {
  const now = Date.now();
  let trialsActive = 0;
  let trialsEndingSoon = 0;
  let trialsExpired = 0;
  let customersActive = 0;
  let overdue = 0;
  let cancelled = 0;
  let everConverted = 0;
  let mrrCents = 0;

  for (const row of rows) {
    const status = effectiveAdminStatus(row);
    if (row.billing_cycle) everConverted += 1;

    if (status === "trial_active") {
      trialsActive += 1;
      const daysLeft = Math.ceil((new Date(row.trial_ends_at).getTime() - now) / 86_400_000);
      if (daysLeft <= 7) trialsEndingSoon += 1;
    } else if (status === "trial_expired") {
      trialsExpired += 1;
    } else if (status === "active_paid") {
      customersActive += 1;
      if (row.billing_cycle && row.amount_cents) {
        mrrCents += row.billing_cycle === "monthly" ? row.amount_cents : row.amount_cents / 12;
      }
    } else if (status === "payment_overdue") {
      overdue += 1;
    } else if (status === "cancelled") {
      cancelled += 1;
    }
  }

  return {
    trialsActive,
    trialsEndingSoon,
    trialsExpired,
    customersActive,
    conversionPercent: rows.length > 0 ? (everConverted / rows.length) * 100 : 0,
    mrrCents: Math.round(mrrCents),
    overdue,
    cancelled,
  };
}

export async function fetchLegalAcceptance(userId: string): Promise<LegalAcceptance | null> {
  const { data, error } = await supabase
    .from("legal_acceptances")
    .select("user_id, terms_version, privacy_version, ai_notice_version, accepted_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as LegalAcceptance | null;
}

export async function acceptRequiredLegalDocuments(): Promise<void> {
  const { error } = await supabase.rpc("accept_required_legal_documents", {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
    p_ai_notice_version: AI_NOTICE_VERSION,
  });
  if (error) throw new Error(error.message);
}

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from("promo_codes")
    .select(
      "id, organization_id, code, description, discount_percent, applies_to_plan, annual_price_cents, active, valid_until, max_redemptions, redemption_count, created_by",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PromoCode[];
}

export async function savePromoCode(input: PromoCodeInput): Promise<void> {
  const code = input.code.trim().toUpperCase();
  const payload = {
    organization_id: input.organizationId,
    code,
    description: input.description,
    discount_percent: input.discountPercent,
    applies_to_plan: input.appliesToPlan,
    active: input.active,
    valid_until: input.validUntil,
    max_redemptions: input.maxRedemptions,
    created_by: input.createdBy,
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase.from("promo_codes").update(payload).eq("id", input.id)
    : supabase.from("promo_codes").insert(payload);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function setPromoCodeActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("promo_codes")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Só calcula e mostra o valor com desconto — não grava nada na assinatura
// nem consome o uso do cupom. Isso vale só pra esta tentativa de checkout;
// fechar o diálogo sem pagar não deixa nenhum desconto "grudado" pra
// próxima vez. A gravação de verdade acontece em createAsaasCheckoutFn,
// no momento de criar o checkout.
export async function previewPromoCode(
  code: string,
  billingCycle: BillingCycle,
): Promise<AppliedPromoCode> {
  const { data, error } = await supabase.rpc("preview_promo_code_to_subscription", {
    p_code: code.trim().toUpperCase(),
    p_billing_cycle: billingCycle,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as AppliedPromoCode;
}
