import { getResearchLimits, getSearchProviderConfig } from "@/lib/config";
import { classifySource, type ClassificationContext } from "@/lib/research/classify";
import type { SearchHit, SearchProvider, SearchResult } from "@/lib/research/types";
import { domainOf, normalizeUrl } from "@/lib/security/url";
import { BraveSearchProvider } from "./brave";
import { TavilySearchProvider } from "./tavily";

/** Returns the configured live search provider, or null when none is configured. */
export function createSearchProvider(): SearchProvider | null {
  const cfg = getSearchProviderConfig();
  if (!cfg) return null;
  const limits = getResearchLimits();
  const opts = { retries: limits.maxRetries, timeoutMs: limits.providerTimeoutMs };
  switch (cfg.id) {
    case "brave":
      return new BraveSearchProvider(cfg.apiKey, opts);
    case "tavily":
      // Optional base URL for an API gateway/proxy in front of Tavily.
      return new TavilySearchProvider(cfg.apiKey, { ...opts, baseUrl: process.env.TAVILY_API_BASE_URL?.replace(/\/$/, "") || undefined });
  }
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 1990 || d.getTime() > Date.now() + 86_400_000) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Converts provider hits into the common SearchResult shape. Drops hits with
 * non-http(s) or unparseable URLs. Never invents fields the provider did not return.
 */
export function normalizeHits(
  hits: SearchHit[],
  provider: string,
  query: string,
  ctx: ClassificationContext,
  now: Date = new Date(),
): SearchResult[] {
  const out: SearchResult[] = [];
  for (const hit of hits) {
    const normalizedUrl = normalizeUrl(hit.url);
    if (!normalizedUrl) continue;
    const title = hit.title.replace(/\s+/g, " ").trim().slice(0, 500);
    out.push({
      url: hit.url,
      normalizedUrl,
      title,
      domain: domainOf(hit.url),
      snippet: hit.snippet.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 1500),
      publishedAt: normalizeDate(hit.publishedAt),
      retrievedAt: now.toISOString(),
      sourceType: classifySource(hit.url, title, ctx),
      provider,
      query,
    });
  }
  return out;
}
