import { supabase } from "@/lib/supabase/client";

export const TERMS_VERSION = "2026-08-25";
export const PRIVACY_VERSION = "2026-08-25";
export const AI_NOTICE_VERSION = "2026-08-25";

export type PlanName = "trial" | "individual" | "family" | "internal";
export type SubscriptionStatus =
  | "trial_active"
  | "trial_expired"
  | "awaiting_pix_confirmation"
  | "active_paid"
  | "payment_overdue"
  | "blocked_readonly";

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
  annualPriceCents: number | null;
  active: boolean;
  validUntil: string | null;
  maxRedemptions: number | null;
  createdBy: string;
};

export type AppliedPromoCode = {
  code: string;
  discount_percent: number;
  base_amount_cents: number;
  discount_amount_cents: number;
  final_amount_cents: number;
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

export function capabilitiesFor(subscription: CommercialSubscription): PlanCapabilities {
  const status = effectiveStatus(subscription);
  const base = PLAN_CAPABILITIES[subscription.plan_name] ?? PLAN_CAPABILITIES.trial;
  if (status === "trial_expired" || status === "payment_overdue" || status === "blocked_readonly") {
    return {
      ...base,
      canInviteMembers: false,
      canCreateWorkspace: false,
      canUseVoice: false,
      canUseAiCategorization: false,
      canUseImport: false,
      canUseExpenseSplit: false,
      canWriteFinancialData: false,
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
      "organization_id, owner_user_id, plan_name, status, trial_started_at, trial_ends_at, paid_until, amount_cents, base_amount_cents, discount_amount_cents, promo_code, discount_percent",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CommercialSubscription | null;
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

export async function fetchPromoCodes(orgId: string): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from("promo_codes")
    .select(
      "id, organization_id, code, description, discount_percent, applies_to_plan, annual_price_cents, active, valid_until, max_redemptions, redemption_count, created_by",
    )
    .eq("organization_id", orgId)
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
    annual_price_cents: input.annualPriceCents,
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

export async function applyPromoCode(
  orgId: string,
  code: string,
  baseAmountCents?: number | null,
): Promise<AppliedPromoCode> {
  const { data, error } = await supabase.rpc("apply_promo_code_to_subscription", {
    p_org_id: orgId,
    p_code: code.trim().toUpperCase(),
    p_base_amount_cents: baseAmountCents ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as AppliedPromoCode;
}
