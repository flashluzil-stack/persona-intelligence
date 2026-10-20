import type { ResearchInput } from "@/lib/validation/schemas";
import { domainOf } from "@/lib/security/url";
import type { SearchCategory } from "./types";

/**
 * Builds targeted queries from the user's identifiers. Queries are only
 * generated for context the user actually supplied, and always quote the
 * full name to reduce matches on other people.
 */

export interface PlannedQuery {
  query: string;
  category: SearchCategory;
}

export interface QueryPlan {
  identity: string[];
  sources: PlannedQuery[];
}

export function buildQueryPlan(
  input: ResearchInput,
  maxQueries: number,
  disambiguator?: string,
  opts: { news?: boolean } = {},
): QueryPlan {
  const name = `"${input.fullName.replace(/"/g, "")}"`;
  const anchor = disambiguator ?? input.company ?? input.role ?? "";
  const anchorPart = anchor ? ` ${anchor.includes(" ") ? `"${anchor.replace(/"/g, "")}"` : anchor}` : "";
  const news = opts.news ?? true;

  const identity: string[] = [];
  if (input.company) identity.push(`${name} "${input.company.replace(/"/g, "")}"`);
  if (input.role) identity.push(`${name} ${input.role}`);
  if (input.profileUrl) {
    const domain = domainOf(input.profileUrl);
    if (domain) identity.push(`${name} site:${domain}`);
  }
  identity.push(input.location ? `${name} ${input.location}` : name);

  // News goes to a provider's news index when one is configured; otherwise it is a web query.
  const newsQuery: PlannedQuery = news ? { query: `${name}${anchorPart}`, category: "news" } : { query: `${name}${anchorPart} news`, category: "web" };
  const sources: PlannedQuery[] = [
    { query: `${name}${anchorPart} interview`, category: "web" },
    newsQuery,
    { query: `${name}${anchorPart} podcast OR talk OR keynote`, category: "web" },
    { query: `${name}${anchorPart} article OR publication OR author`, category: "web" },
    { query: `${name}${anchorPart} project OR launched OR founded`, category: "web" },
    { query: `${name}${anchorPart} speaker conference`, category: "web" },
  ];

  // Identity queries are capped at half the budget; the rest go to source search.
  const identityBudget = Math.max(1, Math.min(identity.length, Math.ceil(maxQueries / 2)));
  const identityQueries = dedupe(identity).slice(0, identityBudget);
  const sourceQueries = dedupePlanned(sources).slice(0, Math.max(0, maxQueries - identityQueries.length));
  return { identity: identityQueries, sources: sourceQueries };
}

const clean = (q: string) => q.replace(/\s+/g, " ").trim();

function dedupe(list: string[]): string[] {
  return [...new Set(list.map(clean))];
}

function dedupePlanned(list: PlannedQuery[]): PlannedQuery[] {
  const seen = new Set<string>();
  const out: PlannedQuery[] = [];
  for (const q of list) {
    const key = `${q.category}:${clean(q.query)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...q, query: clean(q.query) });
  }
  return out;
}
