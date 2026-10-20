import { describe, expect, it, vi } from "vitest";
import { BraveSearchProvider } from "@/lib/providers/search/brave";
import { SearchRouter } from "@/lib/providers/search/router";
import { TavilySearchProvider } from "@/lib/providers/search/tavily";
import { ProviderError, type SearchCategory, type SearchHit, type SearchOptions, type SearchProvider } from "@/lib/research/types";

// Deterministic tests with mocked HTTP responses. No live API is called.

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

class ScriptedProvider implements SearchProvider {
  calls: Array<{ query: string; category?: SearchCategory }> = [];
  constructor(
    readonly id: string,
    readonly categories: readonly SearchCategory[],
    private readonly reply: (query: string, opts: SearchOptions) => SearchHit[] | ProviderError,
  ) {}
  get label() {
    return `Provider ${this.id}`;
  }
  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    this.calls.push({ query, category: opts.category });
    const r = this.reply(query, opts);
    if (r instanceof ProviderError) throw r;
    return r;
  }
}

const hit = (n: number): SearchHit => ({ url: `https://example.com/${n}`, title: `T${n}`, snippet: "s", publishedAt: null });

describe("news search", () => {
  it("Brave uses the news endpoint for the news category", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/res/v1/news/search?");
      return jsonResponse({ type: "news", results: [{ url: "https://news.example/a", title: "A", description: "D", page_age: "2026-09-01T10:00:00" }] });
    });
    const brave = new BraveSearchProvider("k", { retries: 0, timeoutMs: 1000, fetchImpl: fetchImpl as typeof fetch });
    const hits = await brave.search("q", { count: 5, category: "news" });
    expect(hits).toEqual([{ url: "https://news.example/a", title: "A", snippet: "D", publishedAt: "2026-09-01T10:00:00" }]);
  });

  it("Tavily requests the news topic for the news category and general otherwise", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse({ results: [] });
    });
    const tavily = new TavilySearchProvider("k", { retries: 0, timeoutMs: 1000, fetchImpl: fetchImpl as typeof fetch });
    await tavily.search("q", { count: 5, category: "news" });
    await tavily.search("q", { count: 5 });
    expect(bodies.map((b) => b.topic)).toEqual(["news", "general"]);
  });

  it("counts retries of rate-limited requests", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n < 3 ? jsonResponse({}, 429) : jsonResponse({ web: { results: [] } })));
    const brave = new BraveSearchProvider("k", { retries: 2, timeoutMs: 1000, fetchImpl: fetchImpl as typeof fetch, baseDelayMs: 1 });
    const router = new SearchRouter([brave]);
    await router.search("q", "web", { count: 5 });
    expect(router.report()[0]).toMatchObject({ provider: "brave", category: "web", queries: 1, succeeded: 1, retries: 2, failed: 0 });
  });
});

describe("SearchRouter", () => {
  it("sends each query to one provider only (no fan-out)", async () => {
    const a = new ScriptedProvider("a", ["web"], () => [hit(1)]);
    const b = new ScriptedProvider("b", ["web"], () => [hit(2)]);
    const router = new SearchRouter([a, b]);
    const { hits, provider } = await router.search("q", "web", { count: 5 });
    expect(provider.id).toBe("a");
    expect(hits).toHaveLength(1);
    expect(b.calls).toHaveLength(0);
  });

  it("fails over to the next provider when one fails, and reports both", async () => {
    const a = new ScriptedProvider("a", ["web"], () => new ProviderError("A", "timeout", "t", true));
    const b = new ScriptedProvider("b", ["web"], () => [hit(1), hit(2)]);
    const router = new SearchRouter([a, b]);
    const { provider } = await router.search("q", "web", { count: 5 });
    expect(provider.id).toBe("b");
    const report = router.report();
    expect(report.find((r) => r.provider === "a")).toMatchObject({ queries: 1, failed: 1, errors: { timeout: 1 } });
    expect(report.find((r) => r.provider === "b")).toMatchObject({ queries: 1, succeeded: 1, results: 2 });
  });

  it("disables a provider for the rest of the run after a credentials or quota error", async () => {
    const a = new ScriptedProvider("a", ["web", "news"], () => new ProviderError("A", "unauthorized", "401"));
    const b = new ScriptedProvider("b", ["web"], () => [hit(1)]);
    const router = new SearchRouter([a, b]);
    await router.search("q1", "web", { count: 5 });
    await router.search("q2", "web", { count: 5 });
    expect(a.calls).toHaveLength(1);
    expect(router.available("news")).toHaveLength(0);
    await expect(router.search("q3", "news", { count: 5 })).rejects.toMatchObject({ code: "not_configured" });
    expect(router.report().find((r) => r.provider === "a")?.disabled).toBe(true);
  });

  it("routes news only to providers that support it", async () => {
    const webOnly = new ScriptedProvider("w", ["web"], () => [hit(1)]);
    const both = new ScriptedProvider("n", ["web", "news"], () => [hit(2)]);
    const router = new SearchRouter([webOnly, both]);
    expect(router.supports("news")).toBe(true);
    const { provider } = await router.search("q", "news", { count: 5 });
    expect(provider.id).toBe("n");
    expect(both.calls[0].category).toBe("news");
    expect(new SearchRouter([webOnly]).supports("news")).toBe(false);
  });

  it("throws the last provider error when every provider fails", async () => {
    const a = new ScriptedProvider("a", ["web"], () => new ProviderError("A", "rate_limited", "429", true));
    const b = new ScriptedProvider("b", ["web"], () => new ProviderError("B", "bad_response", "500", true));
    const router = new SearchRouter([a, b]);
    await expect(router.search("q", "web", { count: 5 })).rejects.toMatchObject({ code: "bad_response" });
  });

  it("treats providers without declared categories as web-only (older providers keep working)", async () => {
    const legacy: SearchProvider = { id: "legacy", label: "Legacy", search: async () => [hit(1)] };
    const router = new SearchRouter([legacy]);
    expect(router.supports("web")).toBe(true);
    expect(router.supports("news")).toBe(false);
  });
});
