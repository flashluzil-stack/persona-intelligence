import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessConfig } from "@/lib/config";
import { getCatalog, periodReportLimit, type ProductKey } from "./catalog";

/**
 * Read-side entitlement checks. All queries use the signed-in user's client,
 * so Row Level Security limits them to the caller's own rows.
 */

export interface SubscriptionInfo {
  id: string;
  providerSubscriptionId: string;
  productKey: ProductKey;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** True while the subscription grants access (active/trialing, or paid period not yet over). */
  grantsAccess: boolean;
  usedThisPeriod: number;
  periodLimit: number;
}

export interface Entitlements {
  credits: number;
  subscription: SubscriptionInfo | null;
}

export async function getEntitlements(db: SupabaseClient): Promise<Entitlements> {
  const [ledger, subs] = await Promise.all([
    db.from("credit_ledger").select("delta").limit(10_000),
    db.from("subscriptions").select("*").order("updated_at", { ascending: false }).limit(5),
  ]);
  const credits = (ledger.data ?? []).reduce((sum, r) => sum + (r.delta as number), 0);
  const now = Date.now();
  const catalog = getCatalog();
  const rows = subs.data ?? [];
  const pick =
    rows.find((s) => s.status === "active" || s.status === "trialing") ??
    rows.find((s) => (s.status === "past_due" || s.status === "canceled") && s.current_period_end && new Date(s.current_period_end).getTime() > now) ??
    rows[0];
  let subscription: SubscriptionInfo | null = null;
  if (pick) {
    const grantsAccess =
      pick.status === "active" ||
      pick.status === "trialing" ||
      ((pick.status === "past_due" || pick.status === "canceled") && Boolean(pick.current_period_end) && new Date(pick.current_period_end).getTime() > now);
    const productKey = (pick.product_key as ProductKey) in catalog ? (pick.product_key as ProductKey) : "monthly";
    const since = pick.current_period_start ?? new Date(now - 31 * 86_400_000).toISOString();
    const { count } = await db.from("report_unlocks").select("research_project_id", { count: "exact", head: true }).eq("source", "subscription").gte("created_at", since);
    subscription = {
      id: pick.id,
      providerSubscriptionId: pick.provider_subscription_id,
      productKey,
      status: pick.status,
      currentPeriodStart: pick.current_period_start,
      currentPeriodEnd: pick.current_period_end,
      cancelAtPeriodEnd: pick.cancel_at_period_end,
      grantsAccess,
      usedThisPeriod: count ?? 0,
      periodLimit: periodReportLimit(catalog[productKey]),
    };
  }
  return { credits, subscription };
}

export type ReportAccess = { full: true; reason: "open_access" | "unlocked" } | { full: false };

/** Server-side gate for premium report content. */
export async function getReportAccess(db: SupabaseClient, projectId: string): Promise<ReportAccess> {
  if (!getAccessConfig().paywallEnforced) return { full: true, reason: "open_access" };
  const { data } = await db.from("report_unlocks").select("research_project_id").eq("research_project_id", projectId).maybeSingle();
  return data ? { full: true, reason: "unlocked" } : { full: false };
}

/** Unlock status for many reports at once (dashboard). */
export async function getUnlockedSet(db: SupabaseClient, projectIds: string[]): Promise<Set<string>> {
  if (!getAccessConfig().paywallEnforced) return new Set(projectIds);
  if (projectIds.length === 0) return new Set();
  const { data } = await db.from("report_unlocks").select("research_project_id").in("research_project_id", projectIds.slice(0, 500));
  return new Set((data ?? []).map((r) => r.research_project_id as string));
}
