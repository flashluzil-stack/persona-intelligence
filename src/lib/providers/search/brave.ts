import { z } from "zod";
import { errorFromStatus, withRetries } from "@/lib/providers/http";
import { ProviderError, type SearchHit, type SearchOptions, type SearchProvider } from "@/lib/research/types";

const braveResponseSchema = z.object({
  web: z
    .object({
      results: z
        .array(
          z.object({
            url: z.string(),
            title: z.string().default(""),
            description: z.string().optional().default(""),
            page_age: z.string().optional(),
            age: z.string().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

/** Brave Search API: https://api.search.brave.com/app/documentation/web-search */
export class BraveSearchProvider implements SearchProvider {
  readonly id = "brave";
  readonly label = "Brave Search";

  constructor(
    private readonly apiKey: string,
    private readonly opts: { retries: number; timeoutMs: number; fetchImpl?: typeof fetch },
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchHit[]> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(20, options.count)),
      safesearch: "moderate",
      text_decorations: "false",
    });
    const json = await withRetries(
      async (signal) => {
        const res = await fetchImpl(`https://api.search.brave.com/res/v1/web/search?${params}`, {
          headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
          signal,
        });
        if (!res.ok) throw errorFromStatus(this.label, res.status);
        return res.json();
      },
      { retries: this.opts.retries, timeoutMs: this.opts.timeoutMs, provider: this.label, signal: options.signal },
    );
    const parsed = braveResponseSchema.safeParse(json);
    if (!parsed.success) throw new ProviderError(this.label, "bad_response", "Unexpected response format");
    return (parsed.data.web?.results ?? []).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.description ?? "",
      publishedAt: r.page_age ?? null,
    }));
  }
}
