import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { getResearchLimits } from "@/lib/config";
import { scheduleResearchJob } from "@/lib/research/runner";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

// Research continues in after() for the life of this function; allow up to 5 minutes
// (Vercel Fluid Compute limit on all plans). Keep RESEARCH_JOB_TIMEOUT_MS below this.
export const maxDuration = 300;

/** Restarts a queued or stalled job (e.g. if the server was recycled mid-run). */
export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const { supabase, user, accessToken } = g.auth;
  const { data: job } = await supabase
    .from("research_jobs")
    .select("id, status, heartbeat_at, created_at")
    .eq("research_project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job) return jsonError(404, "Not found.");
  const limits = getResearchLimits();
  const lastBeat = new Date((job.heartbeat_at ?? job.created_at) as string).getTime();
  const stalled = job.status === "running" && Date.now() - lastBeat > Math.min(limits.jobTimeoutMs, 120_000);
  if (job.status !== "queued" && !stalled) return jsonError(409, "This job is not stalled.");
  if (stalled) await supabase.from("research_jobs").update({ status: "queued" }).eq("id", job.id);
  scheduleResearchJob(job.id as string, accessToken, user.id);
  return NextResponse.json({ ok: true }, { status: 202 });
}
