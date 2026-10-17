import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getResearchLimits } from "@/lib/config";

export interface QuotaStatus {
  allowed: boolean;
  reason?: string;
  usedToday: number;
  dailyLimit: number;
  activeJobs: number;
  concurrentLimit: number;
}

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
        error_details: { stage: "save_and_quality", code: "stalled", message: "The research worker stopped responding. Saved results are preserved; you can refresh the research." },
      })
      .eq("id", job.id)
      .eq("status", "running");
    await db.from("research_projects").update({ status }).eq("id", job.research_project_id);
  }
}

export async function checkResearchQuota(db: SupabaseClient, userId: string): Promise<QuotaStatus> {
  const limits = getResearchLimits();
  await reapStaleJobs(db);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: settings }, today, active] = await Promise.all([
    db.from("user_settings").select("daily_research_quota").eq("user_id", userId).maybeSingle(),
    db.from("research_jobs").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("research_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
  ]);
  const dailyLimit = settings?.daily_research_quota ?? limits.defaultDailyResearchQuota;
  const usedToday = today.count ?? 0;
  const activeJobs = active.count ?? 0;
  const base = { usedToday, dailyLimit, activeJobs, concurrentLimit: limits.maxConcurrentJobsPerUser };
  if (usedToday >= dailyLimit) {
    return { ...base, allowed: false, reason: `You have used your daily research quota (${dailyLimit} runs in 24 hours). Try again later.` };
  }
  if (activeJobs >= limits.maxConcurrentJobsPerUser) {
    return { ...base, allowed: false, reason: `You already have ${activeJobs} research job(s) running. Wait for one to finish.` };
  }
  return { ...base, allowed: true };
}

export async function checkBriefQuota(db: SupabaseClient): Promise<{ allowed: boolean; reason?: string }> {
  const limits = getResearchLimits();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from("meeting_briefs").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= limits.dailyBriefQuota) {
    return { allowed: false, reason: `Daily meeting brief quota reached (${limits.dailyBriefQuota} per 24 hours).` };
  }
  return { allowed: true };
}
