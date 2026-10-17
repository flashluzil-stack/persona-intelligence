import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { getPublicConfig } from "@/lib/config";
import type { ResearchInput } from "@/lib/validation/schemas";
import { checkResearchQuota, type QuotaStatus } from "./quota";
import { scheduleResearchJob } from "./runner";

export type StartResult =
  | { ok: true; projectId: string; jobId: string }
  | { ok: false; status: number; error: string; code?: string; quota?: QuotaStatus };

/** Shared by the dashboard research form and the public free-preview form. */
export async function startResearch(
  ctx: { supabase: SupabaseClient; user: User; accessToken: string; t: Messages; locale: Locale },
  input: ResearchInput,
): Promise<StartResult> {
  const { supabase, user, accessToken, t, locale } = ctx;
  if (!getPublicConfig().searchConfigured) return { ok: false, status: 503, error: t.errors.searchNotConfigured, code: "search_not_configured" };

  const quota = await checkResearchQuota(supabase, user, t);
  if (!quota.allowed) return { ok: false, status: 429, error: quota.reason ?? t.errors.tooManyRequests, code: quota.code, quota };

  await supabase.from("user_settings").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  const finalInput: ResearchInput = { ...input, locale: input.locale ?? locale };
  const name = [finalInput.fullName, finalInput.company].filter(Boolean).join(" · ");
  const { data: project, error: projectError } = await supabase
    .from("research_projects")
    .insert({ user_id: user.id, name: name.slice(0, 200), research_objective: finalInput.purpose ?? null, input: finalInput, status: "queued" })
    .select("id")
    .single();
  if (projectError || !project) return { ok: false, status: 500, error: t.errors.createFailed };

  const { data: job, error: jobError } = await supabase
    .from("research_jobs")
    .insert({ user_id: user.id, research_project_id: project.id, kind: "initial", status: "queued" })
    .select("id")
    .single();
  if (jobError || !job) return { ok: false, status: 500, error: t.errors.queueFailed };

  await supabase.from("audit_events").insert({ user_id: user.id, event_type: "research.started", metadata: { projectId: project.id, guest: Boolean(user.is_anonymous) } });
  scheduleResearchJob(job.id, accessToken, user.id);
  return { ok: true, projectId: project.id, jobId: job.id };
}
