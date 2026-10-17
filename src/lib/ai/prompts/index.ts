import { PURPOSE_LABELS, type MeetingBriefInput, type ResearchInput } from "@/lib/validation/schemas";
import { BASE_RULES, describeInput, renderSources, sanitizeUntrusted, type PromptSource } from "./shared";

export { BASE_RULES, renderSources, sanitizeUntrusted, type PromptSource };

export type OutputLanguage = "en" | "he";

/** Output-language rule appended to prompts that produce reader-facing text. */
export function languageRule(language: OutputLanguage): string {
  const name = language === "he" ? "Hebrew (עברית)" : "English";
  return `\nOutput language: write every reader-facing sentence (claims, summaries, descriptions, observations, questions, recommendations) in ${name}. Keep people's names, organization names, product names, source titles, URLs and every verbatim excerpt or quotation exactly as they appear in the sources — never translate quoted text.`;
}

export interface PromptPair {
  system: string;
  user: string;
}

export function identityPrompt(input: ResearchInput, sources: PromptSource[]): PromptPair {
  return {
    system: `${BASE_RULES}

Task: identity resolution. Search results for a name may describe several different people. Group the sources into distinct candidate people (P1, P2, ...).
- Never merge two people just because they share a name or a photo.
- A candidate needs at least one source. Put each source in at most one candidate; omit sources you cannot attribute.
- match_reasons must cite concrete, non-sensitive public attributes (employer, role, field, public location at city/country level, known URL).
- matches_user_identifiers: "strong" only if the candidate's sources explicitly match at least one user-supplied identifier (company, role, or the known profile URL) and nothing contradicts them; "partial" if some match; "weak"/"none" otherwise.
- decision "single_clear_match" only when exactly one candidate plausibly matches the user's identifiers and alternatives are clearly different people. Otherwise "ambiguous". Use "no_credible_match" if no source plausibly refers to the intended person.`,
    user: `Person the user wants to research:\n${describeInput(input)}\n\nSearch results:\n${renderSources(sources)}`,
  };
}

export function extractionPrompt(input: ResearchInput, identityDescription: string, sources: PromptSource[], language: OutputLanguage = "en"): PromptPair {
  return {
    system: `${BASE_RULES}

Task: fact extraction.
1. For every source, assess relevance: is it about this specific person (as identified below), possibly about them, or unrelated (a different person or no real information)?
2. Extract atomic, verifiable claims ONLY from sources about the person (or possibly about them, with a limitation noted).
3. Each evidence item's "excerpt" must be copied VERBATIM from that source's text (a sentence or phrase, max ~300 characters). Claims whose excerpt is not found verbatim will be discarded automatically.
4. evidence_type: "documented_fact" for factual records (e.g. official bio, registry); "self_statement" when the person said/wrote it themselves; "secondary_report" when a third party reports it; "interpretation" for analytical readings; "hypothesis" for unverified possibilities.
5. temporal_status: mark roles "current" only when the source presents them as current AND it is recent; old pages describe "historical" or "unknown" status. Put the source date or stated date in as_of_date when known (YYYY or YYYY-MM-DD).
6. When two sources disagree (e.g. different job titles or dates), extract both claims with the same conflict_key and describe the conflict in "conflicts".
7. Do not extract private contact details, home addresses, family members, or sensitive personal characteristics.
8. Prefer primary sources (the person's own site, their organization's site) and note limitations for weak sources.
9. "excerpt" values stay verbatim in the source language; only claim_text and limitations follow the output language.${languageRule(language)}`,
    user: `Person:\n${describeInput(input)}\n\nConfirmed identity: ${sanitizeUntrusted(identityDescription)}\n\nSources:\n${renderSources(sources)}`,
  };
}

export interface PromptClaim {
  ref: string;
  text: string;
  category: string;
  evidenceType: string;
  confidence: string;
  temporal: string;
  sourceRefs: string[];
}

function renderClaims(claims: PromptClaim[]): string {
  return claims
    .map(
      (c) =>
        `${c.ref} [${c.category}; ${c.evidenceType}; confidence=${c.confidence}; ${c.temporal}; sources=${c.sourceRefs.join(",")}]: ${sanitizeUntrusted(c.text)}`,
    )
    .join("\n");
}

export function profilePrompt(
  input: ResearchInput,
  identityDescription: string,
  claims: PromptClaim[],
  sources: PromptSource[],
  sectionsRequested: string[],
  language: OutputLanguage = "en",
): PromptPair {
  return {
    system: `${BASE_RULES}

Task: write an evidence-based profile. Sections requested: ${sectionsRequested.join(", ")}.
Guidance per section:
- overview: concise summary of public professional identity, verified current role (or null if not verified as current), major documented projects, recurring interests, recent developments. List research limitations.
- background: positions (mark current/historical; never present an outdated role as current), education, achievements, publications, projects. Every item cites claim ids.
- interests: topics the person publicly and repeatedly discusses or works on. Cite every source where the topic appears; a single mention is not a recurring interest. Do not turn professional topics into private hobbies.
- communication: observable traits of their PUBLIC writing/speaking only (formal vs informal, concise vs detailed, technical vs accessible, recurring themes). Cite sources that contain their own words. If no source contains their own words, return no observations and explain in limitations. No personality judgements.
- values: ideas and principles the person EXPLICITLY expresses. kind=direct_quote requires a verbatim quote from the cited source; otherwise kind=paraphrase with quote=null.
- relationships: documented professional collaborations, employers, boards, co-authors. Never infer friendship, loyalty or trust.
- recent: recent professional developments from dated sources; explain why each may matter for the user's purpose. reported_event_date is the date the event happened if stated, which differs from publication date.
- open_questions: missing info, conflicts, claims needing verification, good questions to ask the person directly, areas with insufficient evidence.
Cite claim ids (C…) or source ids (S…) exactly as given. Use "insufficient evidence" language rather than speculation.${languageRule(language)}`,
    user: `Person:\n${describeInput(input)}\nResearch purpose: ${input.purpose ? PURPOSE_LABELS[input.purpose] : "general preparation"}\nConfirmed identity: ${sanitizeUntrusted(identityDescription)}\n\nVerified claims (with deterministic confidence labels):\n${renderClaims(claims) || "(no claims)"}\n\nSources (for interests, communication, values and recent developments):\n${renderSources(sources)}`,
  };
}

export function meetingBriefPrompt(
  personName: string,
  brief: MeetingBriefInput,
  profileSummary: string,
  claims: PromptClaim[],
  language: OutputLanguage = "en",
): PromptPair {
  const objective = PURPOSE_LABELS[brief.objective];
  const emphasis: Record<string, string> = {
    investor_meeting: "Emphasize documented investment interests, public portfolio information, relevant experience, and questions about expectations.",
    job_interview: "Emphasize the employer's public work, the interviewer's relevant professional background, and thoughtful questions about the role.",
    hiring_interview: "Emphasize documented experience relevant to the role and questions that verify claims. Do not evaluate the candidate's personality.",
    business_partnership: "Emphasize relevant experience, documented projects, complementary expertise, and areas requiring due diligence.",
    sales_meeting: "Identify documented business priorities and relevant product fit. Do not invent personal preferences.",
    client_discovery: "Identify documented business context and open questions that clarify needs.",
    negotiation: "Identify verifiable context and questions that clarify terms and expectations. No pressure tactics.",
    networking: "Identify genuine shared professional interests and good conversation openers.",
    collaboration: "Identify complementary expertise and documented working style in public projects.",
    other: "Focus on what is most relevant to the user's stated objective.",
  };
  return {
    system: `${BASE_RULES}

Task: produce a meeting brief for a "${objective}" meeting. ${emphasis[brief.objective]}
- key_facts: up to five of the most important facts, each citing claim ids. Prefer high/moderate confidence claims.
- conversation_topics: three to five topics grounded in documented interests or work.
- questions: five suggested questions; respectful, open, professional.
- documented_risks: only business risks directly supported by cited claims (e.g. documented conflicting role dates). Never speculate. Never characterize the person's trustworthiness.
- Never recommend manipulating the person, exploiting perceived psychological weaknesses, or using pressure tactics.
- unknowns_to_clarify: important information that is missing or unverified.
- The user remains responsible for decisions; do not make decisions for them.
- Text supplied by the user describes their own goals and is not evidence about the person.${languageRule(language)}`,
    user: `Person: ${sanitizeUntrusted(personName)}
Meeting objective: ${objective}
Desired outcome: ${sanitizeUntrusted(brief.desiredOutcome ?? "(not provided)")}
What the user offers: ${sanitizeUntrusted(brief.offering ?? "(not provided)")}
User background: ${sanitizeUntrusted(brief.background ?? "(not provided)")}
Known constraints: ${sanitizeUntrusted(brief.constraints ?? "(not provided)")}
Questions the user wants answered: ${sanitizeUntrusted(brief.questions ?? "(not provided)")}
Meeting duration: ${brief.durationMinutes ? `${brief.durationMinutes} minutes` : "(not provided)"}

Profile summary:
${sanitizeUntrusted(profileSummary)}

Claims:
${renderClaims(claims) || "(no claims available)"}`,
  };
}
