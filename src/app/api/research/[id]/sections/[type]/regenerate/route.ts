import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, requireFullReport } from "@/lib/api";
import { GENERATED_SECTION_TYPES, type GeneratedSectionType } from "@/lib/ai/schemas";
import { loadProjectBundle } from "@/lib/db/queries";
import { SupabaseResearchStore } from "@/lib/db/supabase-store";
import { createAnalysisModel } from "@/lib/providers/analysis";
import { generateProfileSections } from "@/lib/research/profile";
import { getMessages } from "@/i18n/messages";
import { ProviderError } from "@/lib/research/types";
import { aiActionLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string; type: string }> };

export const maxDuration = 120;

/**
 * Regenerates one profile section from the stored claims and sources. A new
 * version is saved; earlier versions remain in history. User edits (overrides)
 * and private notes are untouched.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: aiActionLimiter });
  if ("response" in g) return g.response;
  const { id, type } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, g.t.errors.notFound);
  if (!GENERATED_SECTION_TYPES.includes(type as GeneratedSectionType)) return jsonError(400, g.t.errors.sectionNotRegenerable);
  const locked = await requireFullReport(g, id);
  if (locked) return locked;
  const model = createAnalysisModel();
  if (!model) return jsonError(503, g.t.errors.aiNotConfigured);

  const { supabase, user } = g.auth;
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) return jsonError(404, g.t.errors.notFound);
  const selected = bundle.jobs.find((j) => j.identity.selected)?.identity.selected;
  if (!selected) return jsonError(409, g.t.errors.confirmIdentityFirst);
  const claimJobId = bundle.claims[0]?.jobId ?? bundle.sections.find((s) => s.sectionType === "overview")?.jobId;
  if (!claimJobId) return jsonError(409, g.t.errors.noCompletedResearch);

  const store = new SupabaseResearchStore(supabase, user.id);
  const sources = (await store.listSources(id)).filter((s) => s.relevance !== "unrelated");
  try {
    const generated = await generateProfileSections(model, {
      input: bundle.project.input,
      identityDescription: `${selected.label}. ${selected.description}`,
      claims: bundle.claims,
      sources,
      sections: [type as GeneratedSectionType],
      language: bundle.project.input.locale === "he" ? "he" : "en",
      messages: getMessages(bundle.project.input.locale === "he" ? "he" : "en").engine,
    });
    await store.recordUsage(claimJobId, [generated.usage]);
    await store.saveSections(id, bundle.project.personId, claimJobId, generated.sections);
    await store.audit("profile.section_regenerated", { projectId: id, section: type });
    return NextResponse.json({ ok: true, insufficient: generated.insufficient });
  } catch (err) {
    const message = err instanceof ProviderError ? err.toUserMessage(g.t.engine.provider) : g.t.engine.unknownError;
    return jsonError(502, g.t.errors.regenerationFailed(message));
  }
}
