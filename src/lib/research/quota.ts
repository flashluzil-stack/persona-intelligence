import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Messages } from "@/i18n/messages";
import { getAccessConfig, getResearchLimits } from "@/lib/config";
import { getEntitlements } from "@/lib/billing/entitlements";

/**
 * Marks jobs whose worker stopped sending heartbeats as failed (or partial if
 * results were saved), so they stop counting against concurrency.
 */
export async function reapStaleJobs(db: SupabaseClient): Promise<void> {
  const limits = getResearchLimits();
  const cutoff = new Date(Date.now() - limits.jobTimeoutMs - 60_000).toISOString();
  const { data } = await db
    .from("research_jobs")
    .select("id, research_project_id, heartbeat_at, created_at, status")
    .eq("status", "running")
    .lt("heartbeat_at", cutoff);
  for (const job of data ?? []) {
    const { count } = await db.from("sources").select("id", { count: "exact", head: true }).eq("research_project_id", job.research_project_id);
    const status = (count ?? 0) > 0 ? "partial" : "failed";
    await db
      .from("research_jobs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        error_details: { stage: "save_and_quality", code: "stalled", message: "The research worker stopped responding. Saved results are preserved; you can refresh the research." /* localized in the UI by code */ },
      })
      .eq("id", job.id)
      .eq("status", "running");
    await db.from("research_projects").update({ status }).eq("id", job.research_project_id);
  }
}

export interface QuotaStatus {
  allowed: boolean;
  reason?: string;
  code?: "daily_quota" | "concurrent" | "free_limit" | "free_capacity";
  usedToday: number;
  dailyLimit: number;
  activeJobs: number;
  concurrentLimit: number;
  /** Remaining free (locked) previews, or null when the paywall is off or the user subscribes. */
  freeRemaining: number | null;
}

/** Counts this user's reports that are still locked (preview only), optionally within a window. */
async function lockedReportCount(db: SupabaseClient, sinceIso: string | null): Promise<number> {
  // Failed research (nothing usable produced) never uses up a free preview.
  let q = db.from("research_projects").select("id").neq("status", "failed").limit(1000);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data: projects } = await q;
  const ids = (projects ?? []).map((p) => p.id as string);
  if (ids.length === 0) return 0;
  const { data: unlocks } = await db.from("report_unlocks").select("research_project_id").in("research_project_id", ids);
  return ids.length - (unlocks ?? []).length;
}

/**
 * Research quota and free-preview limits. Non-subscribers may hold only a
 * small number of locked previews (guest: total; account: last 30 days);
 * unlocking a report frees a slot. A global daily cap protects provider costs.
 */
export async function checkResearchQuota(db: SupabaseClient, user: { id: string; is_anonymous?: boolean }, t: Messages): Promise<QuotaStatus> {
  const limits = getResearchLimits();
  const access = getAccessConfig();
  await reapStaleJobs(db);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: settings }, today, active, entitlements] = await Promise.all([
    db.from("user_settings").select("daily_research_quota").eq("user_id", user.id).maybeSingle(),
    db.from("research_jobs").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("research_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
    access.paywallEnforced ? getEntitlements(db) : Promise.resolve(null),
  ]);
  const subscriber = Boolean(entitlements?.subscription?.grantsAccess);
  const dailyLimit = subscriber ? access.subscriberDailyResearch : (settings?.daily_research_quota ?? limits.defaultDailyResearchQuota);
  const usedToday = today.count ?? 0;
  const activeJobs = active.count ?? 0;
  const base = { usedToday, dailyLimit, activeJobs, concurrentLimit: limits.maxConcurrentJobsPerUser, freeRemaining: null as number | null };

  // Subscribers and credit holders are not limited by the free allowance (their reports are paid for).
  const hasCredits = (entitlements?.credits ?? 0) >= access.creditsPerReport;
  if (access.paywallEnforced && !subscriber && !hasCredits) {
    const guest = Boolean(user.is_anonymous);
    const limit = guest ? access.freePreviewsGuest : access.freePreviewsPer30Days;
    const locked = await lockedReportCount(db, guest ? null : new Date(Date.now() - 30 * 86_400_000).toISOString());
    base.freeRemaining = Math.max(0, limit - locked);
    if (locked >= limit) {
      return { ...base, allowed: false, code: "free_limit", reason: guest ? t.errors.freeLimitGuest : t.errors.freeLimitAccount(locked) };
    }
    const { data: globalToday } = await db.rpc("free_research_runs_today");
    if (typeof globalToday === "number" && globalToday >= access.freeResearchGlobalDaily) {
      return { ...base, allowed: false, code: "free_capacity", reason: t.errors.freeCapacity };
    }
  }
  if (usedToday >= dailyLimit) {
    return { ...base, allowed: false, code: "daily_quota", reason: t.errors.dailyQuota(dailyLimit) };
  }
  if (activeJobs >= limits.maxConcurrentJobsPerUser) {
    return { ...base, allowed: false, code: "concurrent", reason: t.errors.concurrent(activeJobs) };
  }
  return { ...base, allowed: true };
}

export async function checkBriefQuota(db: SupabaseClient, t: Messages): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getResearchLimits();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("meeting_briefs").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= limits.dailyBriefQuota) {
    return { allowed: false, reason: t.errors.briefQuota(limits.dailyBriefQuota) };
  }
  return { allowed: true };
}
