import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { getPublicConfig } from "@/lib/config";
import { mapJob } from "@/lib/db/mappers";
import { checkResearchQuota } from "@/lib/research/quota";
import { scheduleResearchJob } from "@/lib/research/runner";
import { researchStartLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

// Research continues in after() for the life of this function; allow up to 5 minutes
// (Vercel Fluid Compute limit on all plans). Keep RESEARCH_JOB_TIMEOUT_MS below this.
export const maxDuration = 300;

/**
 * Starts a refresh run for an existing project. The previously confirmed
 * identity is reused; already-retrieved pages are not fetched again.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: researchStartLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const { supabase, user, accessToken } = g.auth;
  if (!getPublicConfig().searchConfigured) return jsonError(503, "No web search provider is configured.");

  const { data: jobs } = await supabase
    .from("research_jobs")
    .select("*")
    .eq("research_project_id", id)
    .order("created_at", { ascending: false });
  if (!jobs?.length) return jsonError(404, "Not found.");
  const latest = mapJob(jobs[0]);
  if (latest.status === "queued" || latest.status === "running") return jsonError(409, "Research is already running.");
  const confirmed = jobs.map(mapJob).find((j) => j.identity.selected);
  if (!confirmed) return jsonError(409, "Confirm the person's identity before refreshing.");

  const quota = await checkResearchQuota(supabase, user.id);
  if (!quota.allowed) return jsonError(429, quota.reason ?? "Quota exceeded.");

  const { data: job, error } = await supabase
    .from("research_jobs")
    .insert({
      user_id: user.id,
      research_project_id: id,
      kind: "refresh",
      status: "queued",
      identity: { ...confirmed.identity, selected: confirmed.identity.selected },
    })
    .select("id")
    .single();
  if (error || !job) return jsonError(500, "Could not queue the refresh.");
  await supabase.from("research_projects").update({ status: "queued" }).eq("id", id);
  await supabase.from("audit_events").insert({ user_id: user.id, event_type: "research.refreshed", metadata: { projectId: id } });
  scheduleResearchJob(job.id, accessToken, user.id);
  return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
}
