import { claimExtractionSchema, type ClaimExtraction } from "@/lib/ai/schemas";
import { extractionPrompt } from "@/lib/ai/prompts";
import type { StructuredModel } from "@/lib/providers/analysis/openai";
import type { ResearchInput } from "@/lib/validation/schemas";
import { sourceCredibility } from "./classify";
import { assessConfidence, excerptFoundIn, type EvidenceForAssessment } from "./evidence";
import { buildSourceRefs, verifiableText } from "./prompt-sources";
import type { NewClaim } from "./store";
import en from "@/i18n/messages/en";
import type { EngineMessages, Relevance, SourceRecord, UsageRecord } from "./types";

export interface VerifiedExtraction {
  claims: NewClaim[];
  rejected: Array<{ claim: string; reason: string }>;
  relevance: Map<string, Relevance>; // sourceId → relevance
  conflicts: Array<{ key: string; description: string }>;
}

const STALE_CURRENT_MS = 1000 * 60 * 60 * 24 * 365 * 2;

function parseLooseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}`;
}

/**
 * Verifies a raw extraction against the stored sources:
 * - evidence must reference a supplied source and quote it verbatim,
 * - evidence from sources judged unrelated is discarded,
 * - claims left without verifiable evidence are rejected,
 * - confidence labels are computed deterministically,
 * - "current" claims backed only by old sources lose their current status.
 */
export function verifyExtraction(
  raw: ClaimExtraction,
  byRef: Map<string, SourceRecord>,
  now: Date = new Date(),
  m: EngineMessages = en.engine,
): VerifiedExtraction {
  const relevance = new Map<string, Relevance>();
  for (const a of raw.source_assessments) {
    const source = byRef.get(a.source_id);
    if (source) relevance.set(source.id, a.relevance);
  }
  const conflictKeys = new Set(raw.claims.map((c) => c.conflict_key).filter((k): k is string => Boolean(k)));
  const conflictCounts = new Map<string, number>();
  for (const c of raw.claims) if (c.conflict_key) conflictCounts.set(c.conflict_key, (conflictCounts.get(c.conflict_key) ?? 0) + 1);

  const claims: NewClaim[] = [];
  const rejected: VerifiedExtraction["rejected"] = [];

  for (const c of raw.claims) {
    const evidence: NewClaim["evidence"] = [];
    const assessments: EvidenceForAssessment[] = [];
    const dates: string[] = [];
    let reason = "No evidence could be verified against the cited sources.";
    for (const e of c.evidence) {
      const source = byRef.get(e.source_id);
      if (!source) {
        reason = "Cited a source that was not supplied.";
        continue;
      }
      if (relevance.get(source.id) === "unrelated") {
        reason = "Cited a source assessed as unrelated to this person.";
        continue;
      }
      if (!excerptFoundIn(e.excerpt, verifiableText(source))) {
        reason = "Supporting excerpt was not found verbatim in the cited source.";
        continue;
      }
      const credibility = sourceCredibility(source.sourceType, source.domain);
      evidence.push({
        sourceId: source.id,
        supportingExcerpt: e.excerpt,
        relationship: e.relationship,
        sourceCredibility: credibility,
        supportStrength: e.support_strength,
        notes: source.retrievalStatus === "retrieved" ? null : m.claims.snippetOnly,
      });
      // Syndicated copies share their original's key, so they never count as independent corroboration.
      const independenceKey = typeof source.metadata?.independenceKey === "string" ? source.metadata.independenceKey : source.domain;
      assessments.push({ domain: independenceKey, credibility, strength: e.support_strength, relationship: e.relationship });
      if (source.publishedAt) dates.push(source.publishedAt);
    }
    if (evidence.length === 0) {
      rejected.push({ claim: c.claim_text, reason });
      continue;
    }

    const inConflict = Boolean(c.conflict_key && (conflictCounts.get(c.conflict_key) ?? 0) > 1 && conflictKeys.has(c.conflict_key));
    const confidence = assessConfidence(c.evidence_type, assessments, inConflict, m.confidence);
    const sortedDates = [...dates, parseLooseDate(c.as_of_date)].filter((d): d is string => Boolean(d)).sort();
    let temporal = c.temporal_status;
    let limitations = c.limitations ?? null;
    if (temporal === "current") {
      const newest = sortedDates.at(-1);
      if (!newest || now.getTime() - new Date(newest).getTime() > STALE_CURRENT_MS) {
        temporal = "unknown";
        limitations = [limitations, newest ? m.claims.staleCurrent : m.claims.undatedCurrent]
          .filter(Boolean)
          .join(" ");
      }
    }
    claims.push({
      claimText: c.claim_text,
      category: c.category,
      evidenceType: c.evidence_type,
      confidenceLabel: confidence.label,
      confidenceRationale: confidence.rationale,
      verificationStatus: confidence.verification,
      temporalStatus: temporal,
      conflictGroup: inConflict ? c.conflict_key : null,
      limitations,
      firstObservedDate: sortedDates[0] ?? null,
      lastObservedDate: sortedDates.at(-1) ?? null,
      evidence,
    });
  }

  const conflicts = raw.conflicts
    .filter((c) => claims.some((cl) => cl.conflictGroup === c.conflict_key))
    .map((c) => ({ key: c.conflict_key, description: c.description }));

  return { claims, rejected, relevance, conflicts };
}

export async function extractClaims(
  model: StructuredModel,
  input: ResearchInput,
  identityDescription: string,
  sources: SourceRecord[],
  signal?: AbortSignal,
  m: EngineMessages = en.engine,
  language: "en" | "he" = "en",
): Promise<{ result: VerifiedExtraction; usage: UsageRecord }> {
  const refs = buildSourceRefs(sources);
  const prompt = extractionPrompt(input, identityDescription, refs.prompt, language);
  const { data, usage } = await model.generate(
    { name: "claim_extraction", schema: claimExtractionSchema, maxOutputTokens: 12_000, ...prompt },
    signal,
  );
  return { result: verifyExtraction(data, refs.byRef, new Date(), m), usage };
}
