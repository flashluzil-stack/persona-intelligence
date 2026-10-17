import type { EvidenceType } from "@/lib/ai/schemas";
import type { SourceCredibility } from "./types";

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

export const CONFIDENCE_LABELS: Record<ConfidenceLabel, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  insufficient: "Insufficient evidence",
};

/**
 * Assigns a confidence label from verified evidence. Source credibility and
 * the strength of support for this particular claim are considered separately.
 */
export function assessConfidence(
  evidenceType: EvidenceType,
  evidence: EvidenceForAssessment[],
  inConflict: boolean,
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

  const sourcesPhrase = `${domains.size} independent source${domains.size === 1 ? "" : "s"}`;

  if (evidenceType === "hypothesis" || evidenceType === "unknown") {
    return { label: "insufficient", verification: "unverified", rationale: "Unverified hypothesis; not established by the available sources." };
  }
  if (supporting.length === 0) {
    return { label: "insufficient", verification, rationale: "No source directly supports this statement." };
  }
  if (strong.length === 0) {
    return { label: "low", verification, rationale: "Sources only indirectly support this statement." };
  }
  if (evidenceType === "interpretation") {
    return {
      label: "low",
      verification,
      rationale: `Analytical interpretation drawn from ${sourcesPhrase}; not a documented fact.`,
    };
  }

  let label: ConfidenceLabel;
  let rationale: string;
  if (domains.size >= 2 && (hasPrimaryDirect || hasEstablishedDirect)) {
    label = "high";
    rationale = `Directly supported by ${sourcesPhrase}, including a ${hasPrimaryDirect ? "primary source" : "established publication"}.`;
  } else if (evidenceType === "self_statement" && hasPrimaryDirect) {
    label = "high";
    rationale = "Stated by the person in a primary source. High confidence that they said it; it reflects their own account.";
  } else if (hasPrimaryDirect || hasEstablishedDirect) {
    label = "moderate";
    rationale = `Supported by a single ${hasPrimaryDirect ? "primary source" : "established publication"}; not independently corroborated.`;
  } else if (domains.size >= 2) {
    label = "moderate";
    rationale = `Supported by ${sourcesPhrase}, none of them primary.`;
  } else {
    label = "low";
    rationale = "Supported by a single secondary or user-generated source.";
  }

  if (contradicted) {
    if (label === "high") label = "moderate";
    rationale += " Other sources conflict with this; see conflicting claims.";
  }
  return { label, verification, rationale };
}
