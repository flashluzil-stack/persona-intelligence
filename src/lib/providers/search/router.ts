import { toProviderError } from "@/lib/providers/http";
import { ProviderError, type ProviderRunReport, type SearchCategory, type SearchHit, type SearchProvider } from "@/lib/research/types";

/**
 * Routes each query to the first configured provider that supports its
 * category, failing over to the next provider when one fails. Every query is
 * sent to ONE provider (no fan-out), so costs stay bounded. A provider that
 * rejects credentials or runs out of quota is disabled for the rest of the run.
 *
 * Records what actually happened per provider and category, so the report can
 * say which sources were searched, how many results came back, and why not.
 */
export class SearchRouter {
  private readonly reports = new Map<string, ProviderRunReport>();
  private readonly disabled = new Set<string>();

  constructor(readonly providers: readonly SearchProvider[]) {}

  supports(category: SearchCategory): boolean {
    return this.providers.some((p) => categoriesOf(p).includes(category));
  }

  /** Providers that can still serve a category in this run (configured and not disabled). */
  available(category: SearchCategory): SearchProvider[] {
    return this.providers.filter((p) => categoriesOf(p).includes(category) && !this.disabled.has(p.id));
  }

  async search(query: string, category: SearchCategory, opts: { count: number; signal?: AbortSignal }): Promise<{ hits: SearchHit[]; provider: SearchProvider }> {
    const candidates = this.available(category);
    if (candidates.length === 0) {
      throw new ProviderError("Search", "not_configured", `No search provider available for ${category}`);
    }
    let lastError: ProviderError | null = null;
    for (const provider of candidates) {
      const report = this.reportFor(provider, category);
      report.queries++;
      try {
        const hits = await provider.search(query, { count: opts.count, signal: opts.signal, category, onRetry: () => report.retries++ });
        report.succeeded++;
        report.results += hits.length;
        return { hits, provider };
      } catch (err) {
        const pe = toProviderError(err, provider.label);
        report.failed++;
        report.errors[pe.code] = (report.errors[pe.code] ?? 0) + 1;
        if (pe.code === "unauthorized" || pe.code === "quota_exceeded") {
          this.disabled.add(provider.id);
          for (const r of this.reports.values()) if (r.provider === provider.id) r.disabled = true;
        }
        lastError = pe;
        if (opts.signal?.aborted) break;
      }
    }
    throw lastError ?? new ProviderError("Search", "unknown", "Search failed");
  }

  report(): ProviderRunReport[] {
    return [...this.reports.values()];
  }

  private reportFor(provider: SearchProvider, category: SearchCategory): ProviderRunReport {
    const key = `${provider.id}:${category}`;
    let r = this.reports.get(key);
    if (!r) {
      r = { provider: provider.id, label: provider.label, category, queries: 0, succeeded: 0, failed: 0, results: 0, retries: 0, errors: {}, disabled: this.disabled.has(provider.id) };
      this.reports.set(key, r);
    }
    return r;
  }
}

function categoriesOf(p: SearchProvider): readonly SearchCategory[] {
  return p.categories ?? ["web"];
}
