import { describe, expect, it } from "vitest";
import { extractFromHtml } from "@/lib/providers/content/extract";
import { isPathAllowed, parseRobots } from "@/lib/providers/content/robots";
import { WebContentProvider, type Fetcher } from "@/lib/providers/content/web-content-provider";
import { normalizeHits } from "@/lib/providers/search";
import { classifySource } from "@/lib/research/classify";
import { dedupeResults } from "@/lib/research/dedupe";
import { buildQueryPlan } from "@/lib/research/queries";
import { ProviderError } from "@/lib/research/types";
import { normalizeUrl } from "@/lib/security/url";

describe("normalizeUrl", () => {
  it("removes tracking params, fragments, www and trailing slashes", () => {
    expect(normalizeUrl("https://www.Example.com/a/b/?utm_source=x&b=2&a=1#section")).toBe("example.com/a/b?a=1&b=2");
    expect(normalizeUrl("http://example.com:80/a/")).toBe(normalizeUrl("https://example.com/a"));
  });
  it("rejects non-http URLs", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("nonsense")).toBeNull();
  });
});

describe("source classification", () => {
  const ctx = { fullName: "Maya Brenner", company: "Northwind Analytics" };
  it.each([
    ["https://www.linkedin.com/in/maya", "Maya", "professional_network"],
    ["https://x.com/maya", "Maya", "social_media"],
    ["https://mayabrenner.com/about", "About", "personal_website"],
    ["https://northwindanalytics.io/team", "Team", "company_website"],
    ["https://www.reuters.com/tech/foo", "Story", "news"],
    ["https://podcasts.apple.com/us/podcast/x", "Ep", "podcast"],
    ["https://summit.example.org/speakers/maya", "Speakers", "conference"],
    ["https://github.com/maya", "maya", "portfolio"],
    ["https://blog.example.org/interview-with-maya", "An interview", "interview"],
  ])("%s → %s", (url, title, expected) => {
    expect(classifySource(url, title, ctx)).toBe(expected);
  });
});

describe("normalizeHits", () => {
  it("drops unparseable URLs and strips markup from snippets", () => {
    const out = normalizeHits(
      [
        { url: "javascript:alert(1)", title: "x", snippet: "y", publishedAt: null },
        { url: "https://example.com/a", title: " Title ", snippet: "<b>Bold</b> text", publishedAt: "2024-03-02T00:00:00Z" },
        { url: "https://example.com/b", title: "T", snippet: "s", publishedAt: "not a date" },
      ],
      "fake",
      "q",
      { fullName: "A B" },
    );
    expect(out).toHaveLength(2);
    expect(out[0].snippet).toBe("Bold text");
    expect(out[0].title).toBe("Title");
    expect(out[0].publishedAt).toBe("2024-03-02");
    expect(out[1].publishedAt).toBeNull();
  });
});

describe("deduplication", () => {
  const base = { title: "", domain: "example.com", snippet: "", publishedAt: null, retrievedAt: "", sourceType: "web_page" as const, provider: "fake" };
  it("merges exact URL duplicates and keeps all queries", () => {
    const { results, stats } = dedupeResults(
      [
        { ...base, url: "https://example.com/a?utm_source=1", normalizedUrl: "example.com/a", query: "q1" },
        { ...base, url: "https://www.example.com/a", normalizedUrl: "example.com/a", query: "q2" },
      ],
      10,
    );
    expect(results).toHaveLength(1);
    expect(results[0].queries).toEqual(["q1", "q2"]);
    expect(stats.exactDuplicates).toBe(1);
  });

  it("drops near-identical syndicated copies", () => {
    const text = "Maya Brenner was appointed chief data officer at Northwind Analytics where she will lead the data platform team starting in March";
    const { results, stats } = dedupeResults(
      [
        { ...base, url: "https://a.com/x", normalizedUrl: "a.com/x", title: "Appointment", snippet: text, query: "q" },
        { ...base, url: "https://b.com/y", normalizedUrl: "b.com/y", title: "Appointment", snippet: text, query: "q" },
      ],
      10,
    );
    expect(results).toHaveLength(1);
    expect(stats.nearDuplicates).toBe(1);
  });

  it("enforces the source limit, preferring primary sources", () => {
    const { results } = dedupeResults(
      [
        { ...base, url: "https://news.com/1", normalizedUrl: "news.com/1", sourceType: "web_page", query: "q", snippet: "one two three four" },
        { ...base, url: "https://maya.com/", normalizedUrl: "maya.com", sourceType: "personal_website", query: "q", snippet: "five six seven eight" },
      ],
      1,
    );
    expect(results[0].normalizedUrl).toBe("maya.com");
  });
});

describe("query planning", () => {
  it("only uses identifiers the user supplied and respects the budget", () => {
    const plan = buildQueryPlan({ fullName: "Maya Brenner" }, 4);
    expect(plan.identity).toEqual(['"Maya Brenner"']);
    expect(plan.identity.length + plan.sources.length).toBeLessThanOrEqual(4);
    expect(plan.sources.every((q) => q.startsWith('"Maya Brenner"'))).toBe(true);
  });
  it("adds company, role and profile domain queries", () => {
    const plan = buildQueryPlan(
      { fullName: "Maya Brenner", company: "Northwind Analytics", role: "CDO", profileUrl: "https://mayabrenner.com" },
      8,
    );
    expect(plan.identity).toContain('"Maya Brenner" "Northwind Analytics"');
    expect(plan.identity).toContain('"Maya Brenner" site:mayabrenner.com');
    expect(plan.sources[0]).toContain('"Northwind Analytics"');
  });
});

describe("robots.txt", () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/public-bio

User-agent: PersonaIntelligenceBot
Disallow: /no-bots
`);
  it("uses the specific group when present", () => {
    expect(isPathAllowed(groups, "PersonaIntelligenceBot", "/no-bots/page")).toBe(false);
    expect(isPathAllowed(groups, "PersonaIntelligenceBot", "/private")).toBe(true);
  });
  it("applies longest match for the wildcard group", () => {
    expect(isPathAllowed(groups, "OtherBot", "/private/x")).toBe(false);
    expect(isPathAllowed(groups, "OtherBot", "/private/public-bio")).toBe(true);
    expect(isPathAllowed(groups, "OtherBot", "/about")).toBe(true);
  });
});

describe("HTML extraction", () => {
  it("extracts metadata and readable text, dropping scripts and navigation", () => {
    const html = `<!doctype html><html><head><title>About Maya</title>
      <meta name="author" content="Maya Brenner"><meta property="article:published_time" content="2025-02-01T10:00:00Z">
      <script>window.secret = "ignore me"</script></head>
      <body><nav>Home | Blog</nav><article><h1>About</h1><p>${"Maya leads data platforms. ".repeat(30)}</p></article><footer>©</footer></body></html>`;
    const page = extractFromHtml(html, 10_000);
    expect(page.title).toBe("About Maya");
    expect(page.author).toBe("Maya Brenner");
    expect(page.publishedAt).toBe("2025-02-01");
    expect(page.text).toContain("Maya leads data platforms.");
    expect(page.text).not.toContain("ignore me");
    expect(page.text).not.toContain("Home | Blog");
  });
  it("truncates long pages", () => {
    const page = extractFromHtml(`<body><p>${"x ".repeat(5000)}</p></body>`, 1000);
    expect(page.truncated).toBe(true);
    expect(page.text.length).toBeLessThanOrEqual(1000);
  });
  it("detects noai opt-outs", () => {
    expect(extractFromHtml('<head><meta name="robots" content="noai, noimageai"></head><body>x</body>', 100).optedOutOfAi).toBe(true);
  });
});

describe("WebContentProvider permissions", () => {
  const ok = (body: string, contentType = "text/html") => ({ finalUrl: "", status: 200, contentType, body, truncated: false });

  it("never fetches platforms that restrict automated access", async () => {
    const calls: string[] = [];
    const fetcher: Fetcher = async (url) => {
      calls.push(url);
      return ok("");
    };
    const provider = new WebContentProvider(fetcher, { maxBytes: 1000, maxChars: 1000 });
    await expect(provider.retrieve("https://www.linkedin.com/in/someone")).rejects.toMatchObject({ code: "not_permitted" });
    expect(calls).toHaveLength(0);
  });

  it("honours robots.txt disallow rules", async () => {
    const fetcher: Fetcher = async (url) => (url.endsWith("/robots.txt") ? ok("User-agent: *\nDisallow: /", "text/plain") : ok("<p>hi</p>"));
    const provider = new WebContentProvider(fetcher, { maxBytes: 1000, maxChars: 1000 });
    await expect(provider.retrieve("https://example.com/page")).rejects.toMatchObject({ code: "not_permitted" });
  });

  it("does not bypass login walls or paywalls", async () => {
    const fetcher: Fetcher = async (url) => (url.endsWith("/robots.txt") ? { ...ok(""), status: 404 } : { ...ok("Sign in"), status: 403 });
    const provider = new WebContentProvider(fetcher, { maxBytes: 1000, maxChars: 1000 });
    await expect(provider.retrieve("https://example.com/members")).rejects.toMatchObject({ code: "not_permitted" });
  });

  it("treats unreachable robots.txt as disallowed", async () => {
    const fetcher: Fetcher = async (url) => {
      if (url.endsWith("/robots.txt")) throw new ProviderError("Page retrieval", "timeout", "timeout");
      return ok("<p>x</p>");
    };
    const provider = new WebContentProvider(fetcher, { maxBytes: 1000, maxChars: 1000 });
    await expect(provider.retrieve("https://example.com/a")).rejects.toMatchObject({ code: "not_permitted" });
  });

  it("retrieves permitted pages", async () => {
    const fetcher: Fetcher = async (url) =>
      url.endsWith("/robots.txt") ? { ...ok(""), status: 404 } : { ...ok(`<title>T</title><article>${"Real content here. ".repeat(40)}</article>`), finalUrl: url };
    const provider = new WebContentProvider(fetcher, { maxBytes: 10_000, maxChars: 5000 });
    const page = await provider.retrieve("https://example.com/a");
    expect(page.title).toBe("T");
    expect(page.text).toContain("Real content here.");
  });
});
