import { parse, type HTMLElement } from "node-html-parser";

export interface ExtractedPage {
  title: string | null;
  description: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string;
  /** Page opted out of AI processing via <meta name="robots" content="noai">. */
  optedOutOfAi: boolean;
}

const REMOVE_SELECTORS = "script, style, noscript, template, svg, iframe, nav, footer, header, aside, form, button, select";

function meta(root: HTMLElement, ...names: string[]): string | null {
  for (const name of names) {
    const el =
      root.querySelector(`meta[name="${name}"]`) ??
      root.querySelector(`meta[property="${name}"]`) ??
      root.querySelector(`meta[itemprop="${name}"]`);
    const content = el?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return null;
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 1990 || d.getTime() > Date.now() + 86_400_000) return null;
  return d.toISOString().slice(0, 10);
}

function jsonLdField(root: HTMLElement, field: "datePublished" | "author"): string | null {
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data: unknown = JSON.parse(script.text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const value = (item as Record<string, unknown>)[field];
        if (typeof value === "string") return value;
        if (field === "author" && value && typeof value === "object") {
          const author = Array.isArray(value) ? value[0] : value;
          if (author && typeof author === "object" && typeof (author as { name?: unknown }).name === "string") {
            return (author as { name: string }).name;
          }
        }
      }
    } catch {
      // Malformed JSON-LD is common; ignore.
    }
  }
  return null;
}

function cleanText(value: string): string {
  return value
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Extracts readable text and metadata from HTML. Output is plain text only. */
export function extractFromHtml(html: string, maxChars: number): ExtractedPage & { truncated: boolean } {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true } });
  const robots = (meta(root, "robots") ?? "").toLowerCase();
  const title =
    meta(root, "og:title") ?? root.querySelector("title")?.text.trim() ?? root.querySelector("h1")?.text.trim() ?? null;
  const description = meta(root, "description", "og:description");
  const author = meta(root, "author", "article:author") ?? jsonLdField(root, "author");
  const publishedAt = isoDate(
    meta(root, "article:published_time", "datePublished", "date", "dc.date", "parsely-pub-date") ??
      jsonLdField(root, "datePublished") ??
      root.querySelector("time[datetime]")?.getAttribute("datetime"),
  );

  // Extract JSON-LD before removing scripts.
  for (const el of root.querySelectorAll(REMOVE_SELECTORS)) el.remove();
  const candidates = [root.querySelector("article"), root.querySelector("main"), root.querySelector("body"), root];
  let text = "";
  for (const el of candidates) {
    if (!el) continue;
    const t = cleanText(el.structuredText ?? el.text);
    if (t.length > 400 || el === root) {
      text = t;
      break;
    }
  }
  const truncated = text.length > maxChars;
  return {
    title: title ? title.replace(/\s+/g, " ").slice(0, 500) : null,
    description: description?.slice(0, 1000) ?? null,
    author: author?.slice(0, 300) ?? null,
    publishedAt,
    text: truncated ? text.slice(0, maxChars) : text,
    truncated,
    optedOutOfAi: /\bnoai\b/.test(robots),
  };
}
