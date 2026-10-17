import type { SourceRecord } from "./types";

/** Stable bibliography numbers: sources about the person first, then the rest. */
export function sourceNumbers(sources: SourceRecord[]): Record<string, number> {
  const ordered = [...sources.filter((s) => s.relevance !== "unrelated"), ...sources.filter((s) => s.relevance === "unrelated")];
  return Object.fromEntries(ordered.map((s, i) => [s.id, i + 1]));
}

export function evidenceContext(claims: { id: string }[], sources: SourceRecord[]) {
  return {
    claimsById: Object.fromEntries(claims.map((c) => [c.id, c])),
    sourcesById: Object.fromEntries(sources.map((s) => [s.id, s])),
    numbers: sourceNumbers(sources),
  };
}
