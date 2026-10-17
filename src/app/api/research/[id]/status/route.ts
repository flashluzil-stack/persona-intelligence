import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { mapJob } from "@/lib/db/mappers";
import { getResearchLimits } from "@/lib/config";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Lightweight polling endpoint for the research workspace. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const { data, error } = await g.auth.supabase
    .from("research_jobs")
    .select("*")
    .eq("research_project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return jsonError(500, "Could not load job status.");
  if (!data) return jsonError(404, "Not found.");
  const job = mapJob(data);
  const limits = getResearchLimits();
  const lastBeat = job.heartbeatAt ?? job.createdAt;
  const stalled =
    (job.status === "queued" && Date.now() - new Date(job.createdAt).getTime() > 45_000 && !job.startedAt) ||
    (job.status === "running" && Date.now() - new Date(lastBeat).getTime() > Math.min(limits.jobTimeoutMs, 120_000));
  return NextResponse.json(
    {
      id: job.id,
      status: job.status,
      currentStage: job.currentStage,
      progress: job.progress,
      errorDetails: job.errorDetails,
      stalled,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
