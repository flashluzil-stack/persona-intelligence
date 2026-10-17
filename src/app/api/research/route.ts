import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, validationError } from "@/lib/api";
import { startResearch } from "@/lib/research/start";
import { researchStartLimiter } from "@/lib/security/rate-limit";
import { researchInputSchema } from "@/lib/validation/schemas";

// Research continues in after() for the life of this function; allow up to 5 minutes
// (Vercel Fluid Compute limit on all plans). Keep RESEARCH_JOB_TIMEOUT_MS below this.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const g = await guard(request, { limiter: researchStartLimiter });
  if ("response" in g) return g.response;
  const body = await readJson(request);
  if (body === null) return jsonError(400, g.t.errors.invalidBody);
  const parsed = researchInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error, g.t);
  const result = await startResearch({ ...g.auth, t: g.t, locale: g.locale }, parsed.data);
  if (!result.ok) return jsonError(result.status, result.error, { code: result.code, quota: result.quota });
  return NextResponse.json({ projectId: result.projectId, jobId: result.jobId }, { status: 202 });
}
