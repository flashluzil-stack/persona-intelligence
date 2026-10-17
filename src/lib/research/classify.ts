import type { SourceCredibility, SourceType } from "./types";

/**
 * Heuristic source classification from URL and title. This only labels the
 * *kind* of source; it never decides whether a source is about the person.
 */

const SOCIAL = ["twitter.com", "x.com", "facebook.com", "instagram.com", "threads.net", "tiktok.com", "bsky.app", "mastodon.social", "reddit.com"];
const VIDEO = ["youtube.com", "youtu.be", "vimeo.com", "ted.com"];
const PODCAST = ["podcasts.apple.com", "open.spotify.com", "podbean.com", "buzzsprout.com", "simplecast.com", "transistor.fm", "anchor.fm", "overcast.fm"];
const PUBLICATION = ["scholar.google.com", "arxiv.org", "doi.org", "researchgate.net", "ssrn.com", "medium.com", "substack.com", "orcid.org", "semanticscholar.org", "pubmed.ncbi.nlm.nih.gov"];
const PORTFOLIO = ["github.com", "gitlab.com", "behance.net", "dribbble.com", "producthunt.com", "huggingface.co"];
const REGISTRY = ["opencorporates.com", "find-and-update.company-information.service.gov.uk", "sec.gov", "companieshouse.gov.uk"];
const REFERENCE = ["wikipedia.org", "wikidata.org", "crunchbase.com"];
const ESTABLISHED_NEWS = [
  "nytimes.com", "wsj.com", "ft.com", "bloomberg.com", "reuters.com", "apnews.com", "bbc.co.uk", "bbc.com",
  "theguardian.com", "economist.com", "washingtonpost.com", "forbes.com", "techcrunch.com", "wired.com",
  "theverge.com", "axios.com", "fortune.com", "businessinsider.com", "cnbc.com", "haaretz.com", "calcalistech.com",
  "globes.co.il", "timesofisrael.com", "lemonde.fr", "spiegel.de", "nature.com", "science.org", "hbr.org",
];

function matchesDomain(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function tokens(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !["inc", "ltd", "llc", "the", "and", "company", "group", "corp"].includes(t));
}

export interface ClassificationContext {
  fullName: string;
  company?: string;
  profileUrl?: string;
}

export function classifySource(url: string, title: string, ctx: ClassificationContext): SourceType {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "web_page";
  }
  const domain = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLowerCase();
  const text = `${path} ${title.toLowerCase()}`;

  if (domain === "linkedin.com" || domain.endsWith(".linkedin.com")) return "professional_network";
  if (matchesDomain(domain, SOCIAL)) return "social_media";
  if (matchesDomain(domain, PODCAST) || /podcast|episode/.test(text)) return "podcast";
  if (matchesDomain(domain, VIDEO)) return "video";
  if (matchesDomain(domain, REGISTRY)) return "registry";
  if (matchesDomain(domain, REFERENCE)) return "reference";
  if (matchesDomain(domain, PUBLICATION)) return "publication";
  if (matchesDomain(domain, PORTFOLIO)) return "portfolio";
  if (/\binterview|q-and-a|\bq&a\b|in-conversation|fireside/.test(text)) return "interview";
  if (/speaker|speakers|conference|summit|keynote|agenda|webinar|panel/.test(text)) return "conference";

  const nameTokens = tokens(ctx.fullName);
  const domainLabel = domain.split(".").slice(0, -1).join("");
  if (ctx.profileUrl) {
    try {
      const profileDomain = new URL(ctx.profileUrl).hostname.toLowerCase().replace(/^www\./, "");
      if (profileDomain === domain && !matchesDomain(domain, [...SOCIAL, "linkedin.com"])) return "personal_website";
    } catch {
      // ignore malformed profile URL; validated upstream
    }
  }
  if (nameTokens.length >= 2 && nameTokens.every((t) => domainLabel.includes(t))) return "personal_website";
  const companyTokens = tokens(ctx.company);
  if (companyTokens.length > 0 && companyTokens.every((t) => domainLabel.includes(t))) return "company_website";
  if (matchesDomain(domain, ESTABLISHED_NEWS) || /\/news\/|\/article|\/press/.test(path)) return "news";
  if (/\/blog\/|\/posts?\/|\/articles?\//.test(path)) return "publication";
  return "web_page";
}

/**
 * Credibility of the *source* (not of any particular claim). Primary sources
 * are the person's or their organization's own publications.
 */
export function sourceCredibility(sourceType: SourceType, domain: string): SourceCredibility {
  switch (sourceType) {
    case "personal_website":
    case "company_website":
    case "registry":
      return "primary";
    case "professional_network":
    case "social_media":
      return "user_generated";
    case "news":
      return matchesDomain(domain, ESTABLISHED_NEWS) ? "established_publication" : "secondary";
    case "publication":
    case "conference":
    case "interview":
    case "podcast":
    case "video":
      return matchesDomain(domain, ESTABLISHED_NEWS) ? "established_publication" : "secondary";
    case "reference":
      return "secondary";
    default:
      return "unknown";
  }
}

/** Platforms whose terms prohibit automated page retrieval or that require login. */
const NO_AUTOMATED_FETCH = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "threads.net",
  "glassdoor.com",
  "crunchbase.com",
];

export function isAutomatedRetrievalRestricted(domain: string): boolean {
  return matchesDomain(domain, NO_AUTOMATED_FETCH);
}

export { tokens as identityTokens };
