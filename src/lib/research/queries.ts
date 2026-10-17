import type { ResearchInput } from "@/lib/validation/schemas";
import { domainOf } from "@/lib/security/url";

/**
 * Builds targeted queries from the user's identifiers. Queries are only
 * generated for context the user actually supplied, and always quote the
 * full name to reduce matches on other people.
 */

export interface QueryPlan {
  identity: string[];
  sources: string[];
}

export function buildQueryPlan(input: ResearchInput, maxQueries: number, disambiguator?: string): QueryPlan {
  const name = `"${input.fullName.replace(/"/g, "")}"`;
  const anchor = disambiguator ?? input.company ?? input.role ?? "";
  const anchorPart = anchor ? ` ${anchor.includes(" ") ? `"${anchor.replace(/"/g, "")}"` : anchor}` : "";

  const identity: string[] = [];
  if (input.company) identity.push(`${name} "${input.company.replace(/"/g, "")}"`);
  if (input.role) identity.push(`${name} ${input.role}`);
  if (input.profileUrl) {
    const domain = domainOf(input.profileUrl);
    if (domain) identity.push(`${name} site:${domain}`);
  }
  identity.push(input.location ? `${name} ${input.location}` : name);

  const sources = [
    `${name}${anchorPart} interview`,
    `${name}${anchorPart} podcast OR talk OR keynote`,
    `${name}${anchorPart} article OR publication OR author`,
    `${name}${anchorPart} project OR launched OR founded`,
    `${name}${anchorPart} speaker conference`,
    `${name}${anchorPart} news`,
  ];

  // Identity queries are capped at half the budget; the rest go to source search.
  const identityBudget = Math.max(1, Math.min(identity.length, Math.ceil(maxQueries / 2)));
  const identityQueries = dedupe(identity).slice(0, identityBudget);
  const sourceQueries = dedupe(sources).slice(0, Math.max(0, maxQueries - identityQueries.length));
  return { identity: identityQueries, sources: sourceQueries };
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((q) => q.replace(/\s+/g, " ").trim()))];
}
