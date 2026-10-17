import { z } from "zod";
import { profilePrompt, type PromptClaim } from "@/lib/ai/prompts";
import { profileSchema, type GeneratedProfile, type GeneratedSectionType } from "@/lib/ai/schemas";
import type { StructuredModel } from "@/lib/providers/analysis/openai";
import type { ResearchInput } from "@/lib/validation/schemas";
import { excerptFoundIn } from "./evidence";
import { buildSourceRefs, verifiableText } from "./prompt-sources";
import type { ClaimRow, NewSection } from "./store";
import type { SourceRecord, UsageRecord } from "./types";

/**
 * Profile generation and post-validation. Section content is stored with
 * database ids (claim_ids / source_ids are UUIDs) so citations always resolve
 * to stored records with their original URLs.
 */

type Cited = { text: string; claim_ids: string[] };

export interface StoredInterestTopic {
  topic: string;
  description: string;
  kind: string;
  source_ids: string[];
  source_count: number;
  recurring: boolean;
  most_recent_date: string | null;
}

export interface StoredValueItem {
  idea: string;
  kind: "direct_quote" | "paraphrase";
  quote: string | null;
  source_id: string;
  note: string | null;
}

export interface StoredRecentItem {
  summary: string;
  source_id: string;
  published_at: string | null;
  reported_event_date: string | null;
  why_it_may_matter: string;
}

export interface VisualStyleContent {
  status: "not_available";
  reason: string;
}

export const VISUAL_STYLE_UNAVAILABLE: VisualStyleContent = {
  status: "not_available",
  reason:
    "Visual style analysis is not enabled in this version. No photographs were retrieved or analysed, and no conclusions are drawn from appearance.",
};

export function claimRefs(claims: ClaimRow[], sourceIdToRef: Map<string, string>): { prompt: PromptClaim[]; byRef: Map<string, ClaimRow> } {
  const byRef = new Map<string, ClaimRow>();
  const prompt = claims.map((c, i) => {
    const ref = `C${i + 1}`;
    byRef.set(ref, c);
    return {
      ref,
      text: c.claimText,
      category: c.category,
      evidenceType: c.evidenceType,
      confidence: c.confidenceLabel,
      temporal: c.temporalStatus,
      sourceRefs: c.evidence.map((e) => sourceIdToRef.get(e.sourceId) ?? "external"),
    };
  });
  return { prompt, byRef };
}

interface RefContext {
  claimsByRef: Map<string, ClaimRow>;
  sourcesByRef: Map<string, SourceRecord>;
}

function mapClaims(ids: string[], ctx: RefContext): string[] {
  return [...new Set(ids.map((r) => ctx.claimsByRef.get(r)?.id).filter((v): v is string => Boolean(v)))];
}

function mapSources(ids: string[], ctx: RefContext): string[] {
  return [...new Set(ids.map((r) => ctx.sourcesByRef.get(r)?.id).filter((v): v is string => Boolean(v)))];
}

function mapCited(items: Cited[], ctx: RefContext, requireCitation = true): Cited[] {
  return items
    .map((i) => ({ text: i.text, claim_ids: mapClaims(i.claim_ids, ctx) }))
    .filter((i) => !requireCitation || i.claim_ids.length > 0);
}

/** Validates references and enforces evidence rules for each generated section. */
export function postprocessProfile(
  raw: Partial<GeneratedProfile>,
  ctx: RefContext,
): { sections: Partial<Record<GeneratedSectionType, Record<string, unknown>>>; insufficient: string[] } {
  const out: Partial<Record<GeneratedSectionType, Record<string, unknown>>> = {};
  const insufficient: string[] = [];
  const claimById = new Map([...ctx.claimsByRef.values()].map((c) => [c.id, c]));
  const sourceById = new Map([...ctx.sourcesByRef.values()].map((s) => [s.id, s]));

  if (raw.overview) {
    const o = raw.overview;
    const limitations = [...o.limitations];
    let currentRole: Cited | null = null;
    if (o.current_role) {
      const ids = mapClaims(o.current_role.claim_ids, ctx);
      const verifiedCurrent = ids.some((id) => claimById.get(id)?.temporalStatus === "current");
      if (verifiedCurrent) currentRole = { text: o.current_role.text, claim_ids: ids };
      else limitations.push("The current role could not be verified as current from dated sources.");
    }
    out.overview = { summary: o.summary, current_role: currentRole, key_points: mapCited(o.key_points, ctx), limitations };
  }

  if (raw.background) {
    const b = raw.background;
    const positions = b.positions
      .map((p) => {
        const ids = mapClaims(p.claim_ids, ctx);
        const claims = ids.map((id) => claimById.get(id)).filter(Boolean) as ClaimRow[];
        let status = p.status;
        if (status === "current" && !claims.some((c) => c.temporalStatus === "current")) status = "unknown";
        return { ...p, status, claim_ids: ids };
      })
      .filter((p) => p.claim_ids.length > 0);
    const section = {
      summary: b.summary,
      positions,
      education: mapCited(b.education, ctx),
      achievements: mapCited(b.achievements, ctx),
      publications: mapCited(b.publications, ctx),
      projects: mapCited(b.projects, ctx),
    };
    out.background = section;
    if (positions.length + section.education.length + section.achievements.length + section.publications.length + section.projects.length === 0) {
      insufficient.push("background");
    }
  }

  if (raw.interests) {
    const topics: StoredInterestTopic[] = raw.interests.topics
      .map((t) => {
        const ids = mapSources(t.source_ids, ctx);
        const dates = ids.map((id) => sourceById.get(id)?.publishedAt).filter((d): d is string => Boolean(d)).sort();
        return {
          topic: t.topic,
          description: t.description,
          kind: t.kind,
          source_ids: ids,
          source_count: ids.length,
          recurring: ids.length >= 2,
          most_recent_date: dates.at(-1) ?? null,
        };
      })
      .filter((t) => t.source_count > 0)
      .sort((a, b) => b.source_count - a.source_count);
    const limitations = [...raw.interests.limitations];
    if (topics.some((t) => !t.recurring)) {
      limitations.push("Topics found in only one source are shown as single mentions, not recurring interests.");
    }
    out.interests = { summary: raw.interests.summary, topics, limitations };
    if (!topics.some((t) => t.recurring)) insufficient.push("interests");
  }

  if (raw.communication) {
    // Communication observations need the person's own words from retrieved pages.
    const observations = raw.communication.observations
      .map((o) => ({
        ...o,
        source_ids: mapSources(o.source_ids, ctx).filter((id) => sourceById.get(id)?.retrievalStatus === "retrieved"),
      }))
      .filter((o) => o.source_ids.length > 0);
    const limitations = [...raw.communication.limitations];
    if (observations.length < raw.communication.observations.length) {
      limitations.push("Observations not grounded in retrieved full-text sources were removed.");
    }
    out.communication = { summary: raw.communication.summary, observations, limitations };
    if (observations.length === 0) insufficient.push("communication");
  }

  if (raw.values) {
    const items: StoredValueItem[] = [];
    for (const v of raw.values.items) {
      const source = ctx.sourcesByRef.get(v.source_id);
      if (!source) continue;
      if (v.kind === "direct_quote") {
        if (v.quote && excerptFoundIn(v.quote, verifiableText(source))) {
          items.push({ idea: v.idea, kind: "direct_quote", quote: v.quote, source_id: source.id, note: null });
        } else {
          items.push({
            idea: v.idea,
            kind: "paraphrase",
            quote: null,
            source_id: source.id,
            note: "A quotation could not be verified verbatim in the source, so this is shown as a paraphrase.",
          });
        }
      } else {
        items.push({ idea: v.idea, kind: "paraphrase", quote: null, source_id: source.id, note: null });
      }
    }
    out.values = { summary: raw.values.summary, items };
    if (items.length === 0) insufficient.push("values");
  }

  if (raw.relationships) {
    const items = raw.relationships.items
      .map((r) => ({ ...r, claim_ids: mapClaims(r.claim_ids, ctx) }))
      .filter((r) => r.claim_ids.length > 0);
    out.relationships = { summary: raw.relationships.summary, items };
    if (items.length === 0) insufficient.push("relationships");
  }

  if (raw.recent) {
    const items: StoredRecentItem[] = raw.recent.items
      .map((r) => {
        const source = ctx.sourcesByRef.get(r.source_id);
        if (!source) return null;
        return {
          summary: r.summary,
          source_id: source.id,
          published_at: source.publishedAt,
          reported_event_date: r.reported_event_date,
          why_it_may_matter: r.why_it_may_matter,
        };
      })
      .filter((r): r is StoredRecentItem => r !== null)
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    out.recent = { summary: raw.recent.summary, items };
    if (items.length === 0) insufficient.push("recent");
  }

  if (raw.open_questions) out.open_questions = { ...raw.open_questions };

  return { sections: out, insufficient };
}

export async function generateProfileSections(
  model: StructuredModel,
  args: {
    input: ResearchInput;
    identityDescription: string;
    claims: ClaimRow[];
    sources: SourceRecord[];
    sections: GeneratedSectionType[];
    signal?: AbortSignal;
  },
): Promise<{ sections: NewSection[]; insufficient: string[]; usage: UsageRecord }> {
  const refs = buildSourceRefs(args.sources, 80_000, 4_000);
  const sourceIdToRef = new Map([...refs.byRef.entries()].map(([ref, s]) => [s.id, ref]));
  const claimCtx = claimRefs(args.claims, sourceIdToRef);
  const pick = Object.fromEntries(args.sections.map((s) => [s, true])) as Partial<Record<GeneratedSectionType, true>>;
  const schema = profileSchema.pick(pick as Record<GeneratedSectionType, true>);
  const prompt = profilePrompt(args.input, args.identityDescription, claimCtx.prompt, refs.prompt, args.sections);
  const { data, usage, model: modelName } = await model.generate(
    { name: "profile_sections", schema: schema as z.ZodType<Partial<GeneratedProfile>>, maxOutputTokens: 12_000, ...prompt },
    args.signal,
  );
  const processed = postprocessProfile(data, { claimsByRef: claimCtx.byRef, sourcesByRef: refs.byRef });
  const generatedAt = new Date().toISOString();
  const sections: NewSection[] = Object.entries(processed.sections).map(([type, content]) => ({
    sectionType: type as GeneratedSectionType,
    content: content as Record<string, unknown>,
    modelMetadata: { provider: "openai", model: modelName, generatedAt },
  }));
  return { sections, insufficient: processed.insufficient, usage };
}
