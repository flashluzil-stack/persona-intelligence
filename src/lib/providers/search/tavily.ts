import { z } from "zod";
import { errorFromStatus, withRetries } from "@/lib/providers/http";
import { ProviderError, type SearchCategory, type SearchHit, type SearchOptions, type SearchProvider } from "@/lib/research/types";

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().default(""),
        content: z.string().optional().default(""),
        published_date: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

/** Tavily Search API (general and news topics): https://docs.tavily.com */
export class TavilySearchProvider implements SearchProvider {
  readonly id = "tavily";
  readonly label = "Tavily";
  readonly categories: readonly SearchCategory[] = ["web", "news"];

  constructor(
    private readonly apiKey: string,
    private readonly opts: { retries: number; timeoutMs: number; fetchImpl?: typeof fetch; baseUrl?: string; baseDelayMs?: number },
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchHit[]> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const json = await withRetries(
      async (signal) => {
        const res = await fetchImpl(`${this.opts.baseUrl ?? "https://api.tavily.com"}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            query,
            max_results: Math.min(20, options.count),
            search_depth: "basic",
            topic: options.category === "news" ? "news" : "general",
            include_answer: false,
            include_raw_content: false,
            include_images: false,
          }),
          signal,
        });
        if (!res.ok) throw errorFromStatus(this.label, res.status);
        return res.json();
      },
      { retries: this.opts.retries, timeoutMs: this.opts.timeoutMs, provider: this.label, signal: options.signal, onRetry: options.onRetry, baseDelayMs: this.opts.baseDelayMs },
    );
    const parsed = tavilyResponseSchema.safeParse(json);
    if (!parsed.success) throw new ProviderError(this.label, "bad_response", "Unexpected response format");
    return parsed.data.results.map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.content ?? "",
      publishedAt: r.published_date ?? null,
    }));
  }
}
