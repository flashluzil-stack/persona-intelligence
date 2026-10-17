import { identityResolutionSchema } from "@/lib/ai/schemas";
import { identityPrompt } from "@/lib/ai/prompts";
import type { StructuredModel } from "@/lib/providers/analysis/openai";
import type { ResearchInput } from "@/lib/validation/schemas";
import { identityTokens } from "./classify";
import { buildSourceRefs } from "./prompt-sources";
import type { IdentityCandidate, IdentityState } from "./store";
import type { SourceRecord, UsageRecord } from "./types";
import { domainOf } from "@/lib/security/url";

/**
 * Identity resolution. Produces candidate people with the public evidence
 * behind each, and decides whether the match is clear enough to proceed
 * automatically. When in doubt, the user must choose.
 */

export interface IdentityOutcome {
  state: IdentityState;
  autoSelected: boolean;
  usage: UsageRecord | null;
}

function hasUserIdentifiers(input: ResearchInput): boolean {
  return Boolean(input.company || input.role || input.profileUrl);
}

function toCandidateSources(records: SourceRecord[]) {
  return records.map((s) => ({ url: s.url, title: s.title, domain: s.domain, normalizedUrl: s.normalizedUrl }));
}

/** Server-side policy for proceeding without asking the user. */
export function canAutoSelect(
  input: ResearchInput,
  decision: IdentityState["decision"],
  candidates: IdentityCandidate[],
  selectedId: string | null,
): IdentityCandidate | null {
  if (decision !== "single_clear_match" || !selectedId) return null;
  if (!hasUserIdentifiers(input)) return null; // a bare name is never enough
  const selected = candidates.find((c) => c.id === selectedId);
  if (!selected || selected.matchStrength !== "strong") return null;
  // If the user supplied a profile URL, it must appear among the candidate's sources.
  if (input.profileUrl) {
    const profileDomain = domainOf(input.profileUrl);
    if (!selected.sources.some((s) => s.domain === profileDomain)) return null;
  }
  return selected;
}

export async function resolveIdentityWithAI(
  model: StructuredModel,
  input: ResearchInput,
  sources: SourceRecord[],
  signal?: AbortSignal,
): Promise<IdentityOutcome> {
  const refs = buildSourceRefs(sources, 40_000, 1_200);
  const prompt = identityPrompt(input, refs.prompt);
  const { data, usage } = await model.generate(
    { name: "identity_resolution", schema: identityResolutionSchema, maxOutputTokens: 4000, ...prompt },
    signal,
  );

  // Keep only references to sources we actually supplied; drop empty candidates.
  const candidates: IdentityCandidate[] = [];
  for (const c of data.candidates) {
    const records = c.source_ids.map((ref) => refs.byRef.get(ref)).filter((s): s is SourceRecord => Boolean(s));
    if (records.length === 0) continue;
    candidates.push({
      id: c.id,
      label: c.label,
      description: c.description,
      attributes: c.distinguishing_attributes,
      matchReasons: c.match_reasons,
      matchStrength: c.matches_user_identifiers,
      sources: toCandidateSources(records),
    });
  }

  const decision = candidates.length === 0 ? "no_credible_match" : data.decision;
  const state: IdentityState = { method: "ai", decision, reasoning: data.reasoning, candidates };
  const auto = canAutoSelect(input, decision, candidates, data.selected_candidate_id);
  if (auto) {
    state.selected = {
      candidateId: auto.id,
      label: auto.label,
      description: auto.description,
      confirmedBy: "automatic",
      sourceNormalizedUrls: auto.sources.map((s) => s.normalizedUrl),
    };
  }
  return { state, autoSelected: Boolean(auto), usage };
}

/**
 * Without an AI provider we cannot attribute sources to people reliably, so we
 * group results by which user-supplied identifiers they mention and always ask
 * the user to confirm.
 */
export function resolveIdentityHeuristically(input: ResearchInput, sources: SourceRecord[]): IdentityOutcome {
  const nameTokens = identityTokens(input.fullName);
  const contextTokens = [
    ...identityTokens(input.company),
    ...identityTokens(input.role),
    ...identityTokens(input.location),
  ];
  const profileDomain = input.profileUrl ? domainOf(input.profileUrl) : null;
  const withContext: SourceRecord[] = [];
  const nameOnly: SourceRecord[] = [];
  for (const s of sources) {
    const text = `${s.title ?? ""} ${s.excerpt ?? ""}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    const mentionsName = nameTokens.every((t) => text.includes(t));
    const mentionsContext = contextTokens.some((t) => text.includes(t)) || (profileDomain !== null && s.domain === profileDomain);
    if (mentionsName && mentionsContext) withContext.push(s);
    else if (mentionsName) nameOnly.push(s);
  }
  const candidates: IdentityCandidate[] = [];
  if (withContext.length > 0) {
    candidates.push({
      id: "P1",
      label: `${input.fullName} — matches your identifiers`,
      description: "Results that mention the name together with at least one identifier you supplied (company, role, location or profile domain).",
      attributes: [input.company, input.role, input.location].filter((v): v is string => Boolean(v)),
      matchReasons: ["Name and at least one supplied identifier appear in the search result title or snippet."],
      matchStrength: "partial",
      sources: toCandidateSources(withContext),
    });
  }
  if (nameOnly.length > 0) {
    candidates.push({
      id: `P${candidates.length + 1}`,
      label: `${input.fullName} — name only`,
      description: "Results that mention the name but none of your identifiers. These may describe a different person.",
      attributes: [],
      matchReasons: ["Only the name matches."],
      matchStrength: "weak",
      sources: toCandidateSources(nameOnly),
    });
  }
  return {
    state: {
      method: "heuristic",
      decision: candidates.length === 0 ? "no_credible_match" : "ambiguous",
      reasoning:
        "AI analysis is not configured, so results were grouped by keyword matching only. Please review the sources and confirm which group refers to the intended person.",
      candidates,
    },
    autoSelected: false,
    usage: null,
  };
}
