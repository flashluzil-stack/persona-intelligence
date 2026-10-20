import type { SearchResult, SourceType } from "./types";

/**
 * Deduplication: exact duplicates by normalized URL (merging the queries that
 * found them), then near-duplicates (syndicated copies) by title+snippet
 * shingle similarity. Prioritizes primary sources when trimming to the limit.
 */

function shingles(text: string, size = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const TYPE_PRIORITY: Record<SourceType, number> = {
  personal_website: 0,
  company_website: 1,
  registry: 2,
  interview: 3,
  publication: 3,
  podcast: 4,
  conference: 4,
  news: 4,
  video: 5,
  portfolio: 5,
  professional_network: 6,
  reference: 6,
  social_media: 7,
  web_page: 8,
};

export interface DedupedResult extends SearchResult {
  queries: string[];
}

export interface DedupeStats {
  input: number;
  exactDuplicates: number;
  nearDuplicates: number;
  trimmed: number;
}

export function dedupeResults(
  results: SearchResult[],
  maxSources: number,
  pinnedNormalizedUrls: Set<string> = new Set(),
): { results: DedupedResult[]; stats: DedupeStats } {
  const byUrl = new Map<string, DedupedResult>();
  let exactDuplicates = 0;
  for (const r of results) {
    const existing = byUrl.get(r.normalizedUrl);
    if (existing) {
      exactDuplicates++;
      if (!existing.queries.includes(r.query)) existing.queries.push(r.query);
      if (!existing.publishedAt && r.publishedAt) existing.publishedAt = r.publishedAt;
      if (r.snippet.length > existing.snippet.length) existing.snippet = r.snippet;
      continue;
    }
    byUrl.set(r.normalizedUrl, { ...r, queries: [r.query] });
  }

  const unique: DedupedResult[] = [];
  const signatures: Set<string>[] = [];
  let nearDuplicates = 0;
  const ordered = [...byUrl.values()].sort(
    (a, b) =>
      Number(pinnedNormalizedUrls.has(b.normalizedUrl)) - Number(pinnedNormalizedUrls.has(a.normalizedUrl)) ||
      TYPE_PRIORITY[a.sourceType] - TYPE_PRIORITY[b.sourceType] ||
      b.queries.length - a.queries.length,
  );
  for (const r of ordered) {
    const sig = shingles(`${r.title} ${r.snippet}`);
    const dup = sig.size >= 8 && signatures.some((s) => jaccard(s, sig) >= 0.8);
    if (dup && !pinnedNormalizedUrls.has(r.normalizedUrl)) {
      nearDuplicates++;
      continue;
    }
    signatures.push(sig);
    unique.push(r);
  }
  const kept = unique.slice(0, maxSources);
  return {
    results: kept,
    stats: { input: results.length, exactDuplicates, nearDuplicates, trimmed: unique.length - kept.length },
  };
}

/** A source with enough text to compare for syndication. */
export interface SyndicationCandidate {
  id: string;
  domain: string;
  publishedAt: string | null;
  credibilityRank: number;
  text: string;
}

export interface SyndicatedCopy {
  sourceId: string;
  /** The source treated as the original. */
  originalId: string;
  /** Independence key shared by the copy and its original (the original's domain). */
  independenceKey: string;
}

const MIN_COMPARABLE_CHARS = 200;

/**
 * Detects syndicated or republished copies AFTER retrieval, by comparing the
 * article text (not just search snippets). Copies of one article on different
 * sites must not count as independent corroboration. The original is the
 * earliest-dated, most authoritative copy.
 */
export function detectSyndication(candidates: SyndicationCandidate[], threshold = 0.6): SyndicatedCopy[] {
  const comparable = candidates
    .filter((c) => c.text.length >= MIN_COMPARABLE_CHARS)
    .map((c) => ({ ...c, sig: shingles(c.text.slice(0, 6000), 5) }))
    .sort(
      (a, b) =>
        (a.publishedAt ?? "9999").localeCompare(b.publishedAt ?? "9999") || a.credibilityRank - b.credibilityRank || a.id.localeCompare(b.id),
    );
  const originals: typeof comparable = [];
  const copies: SyndicatedCopy[] = [];
  for (const c of comparable) {
    const original = originals.find((o) => o.domain !== c.domain && jaccard(o.sig, c.sig) >= threshold);
    if (original) copies.push({ sourceId: c.id, originalId: original.id, independenceKey: original.domain });
    else originals.push(c);
  }
  return copies;
}
