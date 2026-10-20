import type { EvidenceType } from "@/lib/ai/schemas";
import en from "@/i18n/messages/en";
import type { EngineMessages, SourceCredibility } from "./types";

/**
 * Deterministic evidence handling. The AI proposes claims and excerpts; this
 * module verifies excerpts against stored source text and assigns confidence
 * labels from the evidence itself, so the model is never the sole source of
 * truth for factual claims.
 */

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[^\p{L}\p{N}'"\-%$€£.,:;!?()/& ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the excerpt appears in the source text. Ellipses ("..." or "…")
 * split the excerpt into fragments that must each appear, in order.
 */
export function excerptFoundIn(excerpt: string, sourceText: string): boolean {
  const haystack = normalizeForMatch(sourceText);
  const fragments = excerpt
    .split(/\.\.\.|…|\[\.\.\.\]/)
    .map((f) => normalizeForMatch(f).replace(/^[.,;: ]+|[.,;: ]+$/g, ""))
    .filter((f) => f.length > 0);
  if (fragments.length === 0) return false;
  // Very short fragments can match by coincidence; require meaningful length overall.
  if (fragments.reduce((n, f) => n + f.length, 0) < 12) return false;
  let from = 0;
  for (const fragment of fragments) {
    const idx = haystack.indexOf(fragment, from);
    if (idx < 0) return false;
    from = idx + fragment.length;
  }
  return true;
}

export type ConfidenceLabel = "high" | "moderate" | "low" | "insufficient";
export type VerificationStatus = "corroborated" | "single_source" | "conflicting" | "unverified";

export interface EvidenceForAssessment {
  /** Independence key: the source's domain, or its original's domain for a syndicated copy. */
  domain: string;
  credibility: SourceCredibility;
  strength: "direct" | "partial" | "indirect";
  relationship: "supports" | "contradicts" | "context";
}

export interface ConfidenceAssessment {
  label: ConfidenceLabel;
  verification: VerificationStatus;
  rationale: string;
}

/**
 * Assigns a confidence label from verified evidence. Source credibility and
 * the strength of support for this particular claim are considered separately.
 */
export function assessConfidence(
  evidenceType: EvidenceType,
  evidence: EvidenceForAssessment[],
  inConflict: boolean,
  m: EngineMessages["confidence"] = en.engine.confidence,
): ConfidenceAssessment {
  const supporting = evidence.filter((e) => e.relationship === "supports");
  const strong = supporting.filter((e) => e.strength !== "indirect");
  const domains = new Set(strong.map((e) => e.domain));
  const hasPrimaryDirect = strong.some((e) => e.credibility === "primary" && e.strength === "direct");
  const hasEstablishedDirect = strong.some((e) => e.credibility === "established_publication" && e.strength === "direct");
  const contradicted = inConflict || evidence.some((e) => e.relationship === "contradicts");

  const verification: VerificationStatus = contradicted
    ? "conflicting"
    : domains.size >= 2
      ? "corroborated"
      : supporting.length >= 1
        ? "single_source"
        : "unverified";

  if (evidenceType === "hypothesis" || evidenceType === "unknown") {
    return { label: "insufficient", verification: "unverified", rationale: m.hypothesis };
  }
  if (supporting.length === 0) {
    return { label: "insufficient", verification, rationale: m.noSupport };
  }
  if (strong.length === 0) {
    return { label: "low", verification, rationale: m.indirect };
  }
  if (evidenceType === "interpretation") {
    return {
      label: "low",
      verification,
      rationale: m.interpretation(domains.size),
    };
  }

  let label: ConfidenceLabel;
  let rationale: string;
  if (domains.size >= 2 && (hasPrimaryDirect || hasEstablishedDirect)) {
    label = "high";
    rationale = m.highCorroborated(domains.size, hasPrimaryDirect);
  } else if (evidenceType === "self_statement" && hasPrimaryDirect) {
    label = "high";
    rationale = m.selfStatement;
  } else if (hasPrimaryDirect || hasEstablishedDirect) {
    label = "moderate";
    rationale = m.singleStrong(hasPrimaryDirect);
  } else if (domains.size >= 2) {
    label = "moderate";
    rationale = m.multipleSecondary(domains.size);
  } else {
    label = "low";
    rationale = m.singleWeak;
  }

  if (contradicted) {
    if (label === "high") label = "moderate";
    rationale += m.conflicting;
  }
  return { label, verification, rationale };
}
