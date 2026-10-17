import { ProviderError, type ContentProvider, type RetrievedContent } from "@/lib/research/types";
import { isAutomatedRetrievalRestricted } from "@/lib/research/classify";
import { domainOf } from "@/lib/security/url";
import { extractFromHtml } from "./extract";
import { isPathAllowed, parseRobots } from "./robots";
import type { SafeFetchOptions, SafeFetchResult } from "./safe-fetch";

export type Fetcher = (url: string, opts: SafeFetchOptions) => Promise<SafeFetchResult>;

const ROBOTS_TOKEN = "PersonaIntelligenceBot";

/**
 * Retrieves public pages only when permitted:
 * - platforms that prohibit automated access are never fetched,
 * - robots.txt is honoured (4xx = allowed, 5xx/unreachable = disallowed),
 * - pages that opt out of AI processing (meta robots "noai") are not analysed,
 * - login walls, paywalls and CAPTCHAs are never bypassed (non-2xx → failure).
 */
export class WebContentProvider implements ContentProvider {
  private readonly robotsCache = new Map<string, ReturnType<typeof parseRobots> | "disallow_all" | "allow_all">();

  constructor(
    private readonly fetcher: Fetcher,
    private readonly opts: { maxBytes: number; maxChars: number },
  ) {}

  private async robotsFor(origin: string, signal?: AbortSignal) {
    const cached = this.robotsCache.get(origin);
    if (cached) return cached;
    let result: ReturnType<typeof parseRobots> | "disallow_all" | "allow_all";
    try {
      const res = await this.fetcher(`${origin}/robots.txt`, {
        maxBytes: 200_000,
        signal,
        accept: "text/plain,*/*;q=0.1",
      });
      if (res.status >= 400 && res.status < 500) result = "allow_all";
      else if (res.status >= 500) result = "disallow_all";
      else result = parseRobots(res.body);
    } catch {
      result = "disallow_all";
    }
    this.robotsCache.set(origin, result);
    return result;
  }

  async isPermitted(url: string, signal?: AbortSignal): Promise<{ allowed: boolean; reason?: string }> {
    const domain = domainOf(url);
    if (isAutomatedRetrievalRestricted(domain)) {
      return { allowed: false, reason: "This platform restricts automated access; only the search snippet is used." };
    }
    const parsed = new URL(url);
    const robots = await this.robotsFor(parsed.origin, signal);
    if (robots === "allow_all") return { allowed: true };
    if (robots === "disallow_all") {
      return { allowed: false, reason: "robots.txt could not be read, so the page was not retrieved." };
    }
    const allowed = isPathAllowed(robots, ROBOTS_TOKEN, `${parsed.pathname}${parsed.search}`);
    return allowed ? { allowed } : { allowed, reason: "The site's robots.txt disallows automated retrieval of this page." };
  }

  async retrieve(url: string, signal?: AbortSignal): Promise<RetrievedContent> {
    const permission = await this.isPermitted(url, signal);
    if (!permission.allowed) {
      throw new ProviderError("Page retrieval", "not_permitted", permission.reason ?? "Retrieval not permitted");
    }
    const res = await this.fetcher(url, {
      maxBytes: this.opts.maxBytes,
      signal,
      allowedContentTypes: /text\/html|application\/xhtml\+xml|text\/plain/i,
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("Page retrieval", "not_permitted", "The page requires login or denies access.");
    }
    if (res.status === 402 || res.status === 451) {
      throw new ProviderError("Page retrieval", "not_permitted", "The page is paywalled or legally restricted.");
    }
    if (res.status === 429) throw new ProviderError("Page retrieval", "rate_limited", "The site is rate limiting.", true);
    if (res.status >= 400) throw new ProviderError("Page retrieval", "bad_response", `HTTP ${res.status}`);

    if (/text\/plain/i.test(res.contentType)) {
      const text = res.body.slice(0, this.opts.maxChars);
      return { finalUrl: res.finalUrl, title: null, description: null, author: null, publishedAt: null, text, truncated: res.truncated || res.body.length > this.opts.maxChars };
    }
    const page = extractFromHtml(res.body, this.opts.maxChars);
    if (page.optedOutOfAi) {
      throw new ProviderError("Page retrieval", "not_permitted", "The page opts out of AI processing (noai).");
    }
    if (/captcha|are you a robot|verify you are human|enable javascript and cookies/i.test(page.text.slice(0, 600)) && page.text.length < 1500) {
      throw new ProviderError("Page retrieval", "not_permitted", "The page presented a CAPTCHA or bot check; it was not bypassed.");
    }
    return {
      finalUrl: res.finalUrl,
      title: page.title,
      description: page.description,
      author: page.author,
      publishedAt: page.publishedAt,
      text: page.text,
      truncated: res.truncated || page.truncated,
    };
  }
}
