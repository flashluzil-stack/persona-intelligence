import { z } from "zod";
import { errorFromStatus, withRetries } from "@/lib/providers/http";
import { ProviderError, type SearchCategory, type SearchHit, type SearchOptions, type SearchProvider } from "@/lib/research/types";

const resultSchema = z.object({
  url: z.string(),
  title: z.string().default(""),
  description: z.string().optional().default(""),
  page_age: z.string().optional(),
  age: z.string().optional(),
});
const webResponseSchema = z.object({ web: z.object({ results: z.array(resultSchema).default([]) }).optional() });
const newsResponseSchema = z.object({ results: z.array(resultSchema).default([]) });

/**
 * Brave Search API: web and news endpoints.
 * https://api-dashboard.search.brave.com/app/documentation/web-search
 * https://api-dashboard.search.brave.com/app/documentation/news-search
 */
export class BraveSearchProvider implements SearchProvider {
  readonly id = "brave";
  readonly label = "Brave Search";
  readonly categories: readonly SearchCategory[] = ["web", "news"];

  constructor(
    private readonly apiKey: string,
    private readonly opts: { retries: number; timeoutMs: number; fetchImpl?: typeof fetch; baseDelayMs?: number },
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchHit[]> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const news = options.category === "news";
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(20, options.count)),
      safesearch: "moderate",
      ...(news ? {} : { text_decorations: "false" }),
    });
    const endpoint = news ? "news/search" : "web/search";
    const json = await withRetries(
      async (signal) => {
        const res = await fetchImpl(`https://api.search.brave.com/res/v1/${endpoint}?${params}`, {
          headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
          signal,
        });
        if (!res.ok) throw errorFromStatus(this.label, res.status);
        return res.json();
      },
      { retries: this.opts.retries, timeoutMs: this.opts.timeoutMs, provider: this.label, signal: options.signal, onRetry: options.onRetry, baseDelayMs: this.opts.baseDelayMs },
    );
    const results = news ? newsResponseSchema.safeParse(json) : webResponseSchema.safeParse(json);
    if (!results.success) throw new ProviderError(this.label, "bad_response", "Unexpected response format");
    const rows = "web" in results.data ? (results.data.web?.results ?? []) : (results.data as z.infer<typeof newsResponseSchema>).results;
    return rows.map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.description ?? "",
      // page_age is an ISO date; "age" is a relative phrase ("2 days ago") and is not used as a date.
      publishedAt: r.page_age ?? null,
    }));
  }
}
