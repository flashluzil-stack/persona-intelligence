import type { ContentProvider, ProviderErrorCode, SearchCategory, SearchProvider } from "./types";
import { toProviderError } from "@/lib/providers/http";

/**
 * Live provider check for operators. Uses neutral, non-personal queries (never
 * a person's name) and a single page known to permit retrieval, so a check
 * costs at most one search per provider and category plus one page fetch.
 */
export const DIAGNOSTIC_QUERIES: Record<SearchCategory, string> = {
  web: "open source software foundation",
  news: "technology",
};
export const DIAGNOSTIC_PAGE = "https://example.com/";

export interface SearchCheck {
  provider: string;
  label: string;
  category: SearchCategory;
  ok: boolean;
  results: number;
  retries: number;
  ms: number;
  error: ProviderErrorCode | null;
}

export interface RetrievalCheck {
  ok: boolean;
  chars: number;
  ms: number;
  error: ProviderErrorCode | null;
}

export async function runSearchChecks(providers: readonly SearchProvider[], now: () => number = Date.now): Promise<SearchCheck[]> {
  const out: SearchCheck[] = [];
  for (const p of providers) {
    for (const category of p.categories ?? (["web"] as const)) {
      const start = now();
      let retries = 0;
      try {
        const hits = await p.search(DIAGNOSTIC_QUERIES[category], { count: 3, category, onRetry: () => retries++ });
        out.push({ provider: p.id, label: p.label, category, ok: true, results: hits.length, retries, ms: now() - start, error: null });
      } catch (err) {
        out.push({ provider: p.id, label: p.label, category, ok: false, results: 0, retries, ms: now() - start, error: toProviderError(err, p.label).code });
      }
    }
  }
  return out;
}

export async function runRetrievalCheck(content: ContentProvider | null, now: () => number = Date.now): Promise<RetrievalCheck | null> {
  if (!content) return null;
  const start = now();
  try {
    const page = await content.retrieve(DIAGNOSTIC_PAGE);
    return { ok: page.text.length > 0, chars: page.text.length, ms: now() - start, error: null };
  } catch (err) {
    return { ok: false, chars: 0, ms: now() - start, error: toProviderError(err, "Page retrieval").code };
  }
}
