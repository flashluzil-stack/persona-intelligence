import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, validationError } from "@/lib/api";
import { getPublicConfig } from "@/lib/config";
import { checkResearchQuota } from "@/lib/research/quota";
import { scheduleResearchJob } from "@/lib/research/runner";
import { researchStartLimiter } from "@/lib/security/rate-limit";
import { PURPOSE_LABELS, researchInputSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const g = await guard(request, { limiter: researchStartLimiter });
  if ("response" in g) return g.response;
  const { supabase, user, accessToken } = g.auth;

  const body = await readJson(request);
  if (body === null) return jsonError(400, "Invalid request body.");
  const parsed = researchInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;

  const cfg = getPublicConfig();
  if (!cfg.searchConfigured) {
    return jsonError(503, "Live research is not available: no web search provider is configured on this server. The fictional demo profile is available instead.", {
      code: "search_not_configured",
    });
  }

  const quota = await checkResearchQuota(supabase, user.id);
  if (!quota.allowed) return jsonError(429, quota.reason ?? "Quota exceeded.", { code: "quota_exceeded", quota });

  await supabase.from("user_settings").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  const name = [input.fullName, input.company].filter(Boolean).join(" · ");
  const { data: project, error: projectError } = await supabase
    .from("research_projects")
    .insert({
      user_id: user.id,
      name: name.slice(0, 200),
      research_objective: input.purpose ? PURPOSE_LABELS[input.purpose] : null,
      input,
      status: "queued",
    })
    .select("id")
    .single();
  if (projectError || !project) return jsonError(500, "Could not create the research project.");

  const { data: job, error: jobError } = await supabase
    .from("research_jobs")
    .insert({ user_id: user.id, research_project_id: project.id, kind: "initial", status: "queued" })
    .select("id")
    .single();
  if (jobError || !job) return jsonError(500, "Could not queue the research job.");

  await supabase.from("audit_events").insert({ user_id: user.id, event_type: "research.started", metadata: { projectId: project.id } });
  scheduleResearchJob(job.id, accessToken, user.id);
  return NextResponse.json({ projectId: project.id, jobId: job.id }, { status: 202 });
}
