import type { z } from "zod";
import type { StructuredModel, StructuredRequest, StructuredResult } from "@/lib/providers/analysis/openai";
import type { ResearchLimits } from "@/lib/config";
import {
  ProviderError,
  type ContentProvider,
  type RetrievedContent,
  type SearchHit,
  type SearchOptions,
  type SearchProvider,
} from "@/lib/research/types";

export const testLimits: ResearchLimits = {
  maxQueriesPerJob: 6,
  resultsPerQuery: 5,
  maxSourcesPerJob: 20,
  maxPageFetchesPerJob: 5,
  maxPageBytes: 500_000,
  maxContentChars: 10_000,
  maxAiCallsPerJob: 6,
  maxRetries: 0,
  providerTimeoutMs: 1000,
  jobTimeoutMs: 10_000,
  maxConcurrentJobsPerUser: 2,
  defaultDailyResearchQuota: 10,
  dailyBriefQuota: 10,
};

/** Search provider returning canned hits; can be told to fail. */
export class FakeSearch implements SearchProvider {
  readonly id = "fake";
  readonly label = "Fake Search";
  calls: string[] = [];
  constructor(
    private readonly responder: (query: string) => SearchHit[] | ProviderError,
  ) {}
  async search(query: string, _options: SearchOptions): Promise<SearchHit[]> {
    this.calls.push(query);
    const res = this.responder(query);
    if (res instanceof ProviderError) throw res;
    return res;
  }
}

export class FakeContent implements ContentProvider {
  calls: string[] = [];
  constructor(private readonly pages: Record<string, RetrievedContent | ProviderError>) {}
  async retrieve(url: string): Promise<RetrievedContent> {
    this.calls.push(url);
    const page = this.pages[url];
    if (!page) throw new ProviderError("Page retrieval", "bad_response", "HTTP 404");
    if (page instanceof ProviderError) throw page;
    return page;
  }
}

export function page(url: string, text: string, extra: Partial<RetrievedContent> = {}): RetrievedContent {
  return { finalUrl: url, title: null, description: null, author: null, publishedAt: null, text, truncated: false, ...extra };
}

type Responder = (req: StructuredRequest<z.ZodType>) => unknown;

/**
 * Scripted model: returns the response registered for each schema name.
 * Output is validated with the real schema, exactly like the OpenAI client.
 */
export class FakeModel implements StructuredModel {
  readonly id = "fake";
  readonly model = "fake-model";
  requests: Array<{ name: string; system: string; user: string }> = [];
  constructor(private readonly responses: Record<string, Responder | ProviderError>) {}
  async generate<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResult<z.infer<T>>> {
    this.requests.push({ name: req.name, system: req.system, user: req.user });
    const responder = this.responses[req.name];
    if (!responder) throw new ProviderError("Fake model", "not_configured", `No response for ${req.name}`);
    if (responder instanceof ProviderError) throw responder;
    const parsed = req.schema.safeParse(responder(req as StructuredRequest<z.ZodType>));
    if (!parsed.success) throw new ProviderError("Fake model", "invalid_output", parsed.error.message);
    return { data: parsed.data, model: this.model, usage: { kind: "ai_call", provider: "fake", units: 1, inputTokens: 100, outputTokens: 50 } };
  }
}
