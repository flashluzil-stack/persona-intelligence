import type { ClaimRow, QualityReport, SectionRow } from "@/lib/research/store";
import type { StoredInterestTopic } from "@/lib/research/profile";
import type { SourceRecord } from "@/lib/research/types";

/**
 * Builds the free-preview payload ON THE SERVER. Only content listed here is
 * ever sent to a browser that has not unlocked the report. Locked sections are
 * described by genuine counts taken from the report — never by their text.
 */

export type LockedKey =
  | "background"
  | "interests"
  | "communication"
  | "values"
  | "relationships"
  | "recent"
  | "open_questions"
  | "evidence"
  | "sources"
  | "meeting";

export interface LockedCard {
  key: LockedKey;
  /** "available": the section has substantive content; "limited": little or no evidence; "missing": not generated. */
  status: "available" | "limited" | "missing";
  counts: Array<{ kind: "positions" | "items" | "topics" | "observations" | "questions" | "claims" | "sources" | "briefs"; n?: number; m?: number }>;
}

export interface PreviewData {
  overview: SectionRow | null;
  findings: ClaimRow[];
  sources: SourceRecord[];
  quality: Pick<QualityReport, "sourcesFound" | "claimsExtracted" | "claimsByConfidence" | "limitations"> | null;
  locked: LockedCard[];
}

const CONFIDENCE_RANK = { high: 0, moderate: 1, low: 2, insufficient: 3 } as const;

type Cited = { text: string; claim_ids: string[] };
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function buildPreview(
  args: { sections: SectionRow[]; claims: ClaimRow[]; sources: SourceRecord[]; quality: QualityReport | null },
  opts: { findings: number; keyPoints: number },
): PreviewData {
  const byType = new Map(args.sections.map((s) => [s.sectionType, s]));
  const overviewFull = byType.get("overview") ?? null;

  // Overview: summary, current role and the first key points only.
  let overview: SectionRow | null = null;
  const visibleClaimIds = new Set<string>();
  if (overviewFull) {
    const c = overviewFull.content as { summary?: string; current_role?: Cited | null; key_points?: Cited[]; limitations?: string[] };
    const keyPoints = arr<Cited>(c.key_points).slice(0, opts.keyPoints);
    for (const k of keyPoints) k.claim_ids.forEach((id) => visibleClaimIds.add(id));
    c.current_role?.claim_ids.forEach((id) => visibleClaimIds.add(id));
    overview = {
      ...overviewFull,
      content: { summary: c.summary, current_role: c.current_role ?? null, key_points: keyPoints, limitations: arr<string>(c.limitations) },
      modelMetadata: {},
    };
  }

  // Findings: the strongest claims, preferring variety of categories.
  const ranked = [...args.claims]
    .filter((c) => c.confidenceLabel !== "insufficient")
    .sort((a, b) => CONFIDENCE_RANK[a.confidenceLabel] - CONFIDENCE_RANK[b.confidenceLabel]);
  const findings: ClaimRow[] = [];
  const seenCategories = new Set<string>();
  for (const pass of [true, false]) {
    for (const c of ranked) {
      if (findings.length >= opts.findings) break;
      if (findings.includes(c)) continue;
      if (pass && seenCategories.has(c.category)) continue;
      findings.push(c);
      seenCategories.add(c.category);
    }
  }
  findings.forEach((c) => visibleClaimIds.add(c.id));

  // Claims referenced by the visible overview must also carry their evidence.
  const claimById = new Map(args.claims.map((c) => [c.id, c]));
  const visibleClaims = [...visibleClaimIds].map((id) => claimById.get(id)).filter((c): c is ClaimRow => Boolean(c));
  const visibleSourceIds = new Set(visibleClaims.flatMap((c) => c.evidence.map((e) => e.sourceId)));
  const sources = args.sources.filter((s) => visibleSourceIds.has(s.id)).map((s) => ({ ...s, contentText: null }));

  const locked: LockedCard[] = [];
  const status = (has: boolean, section: SectionRow | undefined): LockedCard["status"] => (!section ? "missing" : has ? "available" : "limited");

  const bg = byType.get("background");
  const bgc = (bg?.content ?? {}) as Record<string, unknown>;
  const positions = arr(bgc.positions).length;
  const otherBg = ["education", "achievements", "publications", "projects"].reduce((n, k) => n + arr(bgc[k]).length, 0);
  locked.push({ key: "background", status: status(positions + otherBg > 0, bg), counts: [{ kind: "positions", n: positions }, { kind: "items", n: otherBg }] });

  const it = byType.get("interests");
  const topics = arr<StoredInterestTopic>((it?.content as Record<string, unknown> | undefined)?.topics);
  const recurring = topics.filter((t) => t.recurring).length;
  locked.push({ key: "interests", status: status(recurring > 0, it), counts: [{ kind: "topics", n: topics.length, m: recurring }] });

  const cm = byType.get("communication");
  const obs = arr((cm?.content as Record<string, unknown> | undefined)?.observations).length;
  locked.push({ key: "communication", status: status(obs > 0, cm), counts: [{ kind: "observations", n: obs }] });

  for (const key of ["values", "relationships", "recent"] as const) {
    const s = byType.get(key);
    const n = arr((s?.content as Record<string, unknown> | undefined)?.items).length;
    locked.push({ key, status: status(n > 0, s), counts: [{ kind: "items", n }] });
  }

  const oq = byType.get("open_questions");
  const oqc = (oq?.content ?? {}) as Record<string, unknown>;
  const questions = Object.values(oqc).reduce<number>((n, v) => n + arr(v).length, 0);
  locked.push({ key: "open_questions", status: status(questions > 0, oq), counts: [{ kind: "questions", n: questions }] });

  const remainingClaims = args.claims.length - findings.length;
  locked.push({ key: "evidence", status: args.claims.length ? (remainingClaims > 0 ? "available" : "limited") : "missing", counts: [{ kind: "claims", n: Math.max(0, remainingClaims) }] });
  const relevantSources = args.sources.filter((s) => s.relevance !== "unrelated").length;
  locked.push({ key: "sources", status: relevantSources ? "available" : "limited", counts: [{ kind: "sources", n: relevantSources }] });
  locked.push({ key: "meeting", status: args.claims.length ? "available" : "limited", counts: [{ kind: "briefs" }] });

  return {
    overview,
    findings,
    sources,
    quality: args.quality
      ? { sourcesFound: args.quality.sourcesFound, claimsExtracted: args.quality.claimsExtracted, claimsByConfidence: args.quality.claimsByConfidence, limitations: args.quality.limitations }
      : null,
    locked,
  };
}
