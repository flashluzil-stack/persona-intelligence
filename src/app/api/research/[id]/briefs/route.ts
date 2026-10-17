import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, requireFullReport, validationError } from "@/lib/api";
import { loadProjectBundle } from "@/lib/db/queries";
import { createAnalysisModel } from "@/lib/providers/analysis";
import { generateMeetingBrief } from "@/lib/research/meeting";
import { checkBriefQuota } from "@/lib/research/quota";
import { ProviderError } from "@/lib/research/types";
import { aiActionLimiter } from "@/lib/security/rate-limit";
import { meetingBriefInputSchema, uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: aiActionLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, g.t.errors.notFound);
  const parsed = meetingBriefInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error, g.t);
  const model = createAnalysisModel();
  if (!model) return jsonError(503, g.t.errors.aiNotConfigured);

  const { supabase, user } = g.auth;
  const locked = await requireFullReport(g, id);
  if (locked) return locked;
  const quota = await checkBriefQuota(supabase, g.t);
  if (!quota.allowed) return jsonError(429, quota.reason ?? g.t.errors.tooManyRequests);
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) return jsonError(404, g.t.errors.notFound);
  if (!["completed", "partial"].includes(bundle.project.status) && bundle.claims.length === 0) {
    return jsonError(409, g.t.errors.finishResearchFirst);
  }

  const overview = bundle.sections.find((s) => s.sectionType === "overview");
  const summary =
    overview?.userOverride ??
    (overview?.content as { summary?: string } | undefined)?.summary ??
    "No profile summary is available.";
  try {
    const result = await generateMeetingBrief(model, {
      personName: bundle.project.input.fullName,
      brief: parsed.data,
      profileSummary: summary,
      claims: bundle.claims,
      language: g.locale,
    });
    const { data, error } = await supabase
      .from("meeting_briefs")
      .insert({
        user_id: user.id,
        research_project_id: id,
        objective: parsed.data.objective,
        context: parsed.data,
        structured_brief: result.brief,
        model_metadata: { provider: "openai", model: result.model, generatedAt: new Date().toISOString() },
      })
      .select("id")
      .single();
    if (error || !data) return jsonError(500, g.t.errors.saveFailed);
    await supabase.from("usage_events").insert({
      user_id: user.id,
      kind: "ai_call",
      provider: result.usage.provider,
      units: result.usage.units,
      input_tokens: result.usage.inputTokens ?? null,
      output_tokens: result.usage.outputTokens ?? null,
    });
    await supabase.from("audit_events").insert({ user_id: user.id, event_type: "brief.created", metadata: { projectId: id, briefId: data.id } });
    return NextResponse.json({ briefId: data.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof ProviderError ? err.toUserMessage(g.t.engine.provider) : g.t.errors.briefFailed;
    return jsonError(502, message);
  }
}
