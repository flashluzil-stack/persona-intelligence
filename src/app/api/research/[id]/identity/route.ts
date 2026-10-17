import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, validationError } from "@/lib/api";
import { mapJob } from "@/lib/db/mappers";
import { scheduleResearchJob } from "@/lib/research/runner";
import type { IdentityState } from "@/lib/research/store";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { identitySelectionSchema, uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

// Research continues in after() for the life of this function; allow up to 5 minutes
// (Vercel Fluid Compute limit on all plans). Keep RESEARCH_JOB_TIMEOUT_MS below this.
export const maxDuration = 300;

/**
 * Records the user's choice among identity candidates and resumes the job.
 * candidateId "none" stops the job: no candidate is merged by default.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const parsed = identitySelectionSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { supabase, user, accessToken } = g.auth;

  const { data } = await supabase
    .from("research_jobs")
    .select("*")
    .eq("research_project_id", id)
    .eq("status", "needs_input")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return jsonError(409, "This research is not waiting for an identity choice.");
  const job = mapJob(data);

  if (parsed.data.candidateId === "none") {
    await supabase
      .from("research_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_details: {
          stage: "identity_discovery",
          code: "identity_rejected",
          message: "You indicated none of the candidates is the intended person. Start a new search with more identifying details.",
        },
      })
      .eq("id", job.id);
    await supabase.from("research_projects").update({ status: "failed" }).eq("id", id);
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const candidate = job.identity.candidates?.find((c) => c.id === parsed.data.candidateId);
  if (!candidate) return jsonError(400, "Unknown candidate.");
  const identity: IdentityState = {
    ...job.identity,
    selected: {
      candidateId: candidate.id,
      label: candidate.label,
      description: candidate.description,
      confirmedBy: "user",
      additionalContext: parsed.data.additionalContext,
      sourceNormalizedUrls: candidate.sources.map((s) => s.normalizedUrl),
    },
  };
  const { error } = await supabase.from("research_jobs").update({ status: "queued", identity }).eq("id", job.id).eq("status", "needs_input");
  if (error) return jsonError(500, "Could not save your selection.");
  await supabase.from("research_projects").update({ status: "queued" }).eq("id", id);
  await supabase.from("audit_events").insert({ user_id: user.id, event_type: "research.identity_confirmed", metadata: { projectId: id } });
  scheduleResearchJob(job.id, accessToken, user.id);
  return NextResponse.json({ ok: true, status: "queued" }, { status: 202 });
}
