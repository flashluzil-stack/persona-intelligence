import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson, validationError } from "@/lib/api";
import { loadProjectBundle } from "@/lib/db/queries";
import { createAnalysisModel } from "@/lib/providers/analysis";
import { generateMeetingBrief } from "@/lib/research/meeting";
import { checkBriefQuota } from "@/lib/research/quota";
import { ProviderError } from "@/lib/research/types";
import { aiActionLimiter } from "@/lib/security/rate-limit";
import { meetingBriefInputSchema, PURPOSE_LABELS, uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: aiActionLimiter });
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const parsed = meetingBriefInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const model = createAnalysisModel();
  if (!model) return jsonError(503, "AI analysis is not configured on this server, so meeting briefs cannot be generated.");

  const { supabase, user } = g.auth;
  const quota = await checkBriefQuota(supabase);
  if (!quota.allowed) return jsonError(429, quota.reason ?? "Quota exceeded.");
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) return jsonError(404, "Not found.");
  if (!["completed", "partial"].includes(bundle.project.status) && bundle.claims.length === 0) {
    return jsonError(409, "Finish the research before generating a meeting brief.");
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
    });
    const { data, error } = await supabase
      .from("meeting_briefs")
      .insert({
        user_id: user.id,
        research_project_id: id,
        objective: PURPOSE_LABELS[parsed.data.objective],
        context: parsed.data,
        structured_brief: result.brief,
        model_metadata: { provider: "openai", model: result.model, generatedAt: new Date().toISOString() },
      })
      .select("id")
      .single();
    if (error || !data) return jsonError(500, "Could not save the meeting brief.");
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
    const message = err instanceof ProviderError ? err.toUserMessage() : "Brief generation failed.";
    return jsonError(502, message);
  }
}
