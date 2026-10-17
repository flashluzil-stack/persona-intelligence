import type { StoredMeetingBrief } from "@/lib/research/meeting";
import { VISUAL_STYLE_UNAVAILABLE } from "@/lib/research/profile";
import type { ClaimRow, EvidenceRow, QualityReport, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";

/**
 * FICTIONAL DEMO DATA. The person, organizations, sources and quotes below
 * are invented for illustration. URLs use the reserved ".example" domain so
 * they can never point at a real site. This data is never stored as research
 * and is always displayed with a "Fictional demo" label.
 */

export const DEMO_PERSON = {
  name: "Dana Okafor-Lindqvist",
  label: "Dana Okafor-Lindqvist, VP Product at Brightwater Mobility (fictional)",
  lastResearchedAt: "2026-10-01T09:30:00Z",
};

const src = (
  id: string,
  title: string,
  url: string,
  sourceType: SourceRecord["sourceType"],
  publishedAt: string | null,
  excerpt: string,
  retrievalStatus: SourceRecord["retrievalStatus"] = "retrieved",
  relevance: SourceRecord["relevance"] = "about_person",
  retrievalNote: string | null = null,
): SourceRecord => ({
  id,
  url,
  normalizedUrl: url.replace(/^https?:\/\//, ""),
  title,
  domain: new URL(url).hostname,
  sourceType,
  author: null,
  publishedAt,
  accessedAt: "2026-10-01T09:20:00Z",
  excerpt,
  contentText: null,
  retrievalStatus,
  retrievalNote,
  relevance,
  provider: "fictional-demo",
  metadata: {},
});

export const DEMO_SOURCES: SourceRecord[] = [
  src("demo-s1", "About Dana", "https://danaokafor.example/about", "personal_website", "2026-06-12", "I lead product at Brightwater Mobility, where we build routing software for city bus networks."),
  src("demo-s2", "Leadership — Brightwater Mobility", "https://brightwater-mobility.example/company/leadership", "company_website", "2026-03-02", "Dana Okafor-Lindqvist is Vice President of Product at Brightwater Mobility."),
  src("demo-s3", "Brightwater Mobility appoints new product chief", "https://transitweekly.example/news/brightwater-appoints-product-chief", "news", "2024-09-18", "Brightwater Mobility has appointed Dana Okafor-Lindqvist as vice president of product. She joins from Nordline Freight, where she led the planning tools team."),
  src("demo-s4", "Designing transit software riders never notice — Mobility Futures Podcast, Ep. 41", "https://mobilityfutures.example/episodes/41", "podcast", "2026-02-20", "“The best transit software is the kind riders never notice,” Okafor-Lindqvist said, arguing for accessibility testing with real riders."),
  src("demo-s5", "Open Transit Summit 2025 — Speakers", "https://opentransitsummit.example/2025/speakers", "conference", "2025-05-10", "Dana Okafor-Lindqvist (Brightwater Mobility) — Keynote: Accessibility as a product requirement."),
  src("demo-s6", "Why we publish our routing benchmarks", "https://danaokafor.example/writing/routing-benchmarks", "publication", "2025-11-03", "We publish our routing benchmarks because transit agencies deserve to compare vendors on evidence, not slideware."),
  src("demo-s7", "Dana Okafor-Lindqvist | Professional profile", "https://professional-network.example/in/dana-okafor-lindqvist", "professional_network", null, "VP Product at Brightwater Mobility. Previously Nordline Freight (2019–2024).", "not_permitted", "about_person", "This platform restricts automated access; only the search snippet is used."),
  src("demo-s8", "Nordline Freight team page (archived)", "https://nordline-freight.example/team", "company_website", "2023-01-15", "Dana Okafor-Lindqvist — Head of Planning Tools.", "snippet_only"),
  src("demo-s9", "Dana Lindqvist — watercolour artist", "https://lindqvist-art.example/", "web_page", "2022-04-01", "Dana Lindqvist paints coastal landscapes in Gothenburg.", "snippet_only", "unrelated"),
];

const ev = (claimId: string, n: number, sourceId: string, excerpt: string, credibility: EvidenceRow["sourceCredibility"], strength: EvidenceRow["supportStrength"] = "direct"): EvidenceRow => ({
  id: `${claimId}-e${n}`,
  claimId,
  sourceId,
  supportingExcerpt: excerpt,
  relationship: "supports",
  sourceCredibility: credibility,
  supportStrength: strength,
  notes: null,
});

const claim = (id: string, text: string, rest: Partial<ClaimRow> & Pick<ClaimRow, "category" | "evidenceType" | "confidenceLabel" | "confidenceRationale" | "verificationStatus">, evidence: EvidenceRow[]): ClaimRow => ({
  id,
  projectId: "demo",
  jobId: "demo-job",
  personId: "demo-person",
  claimText: text,
  temporalStatus: "unknown",
  conflictGroup: null,
  limitations: null,
  firstObservedDate: null,
  lastObservedDate: null,
  createdAt: "2026-10-01T09:30:00Z",
  evidence,
  ...rest,
});

export const DEMO_CLAIMS: ClaimRow[] = [
  claim(
    "demo-c1",
    "Dana Okafor-Lindqvist is Vice President of Product at Brightwater Mobility.",
    {
      category: "current_role",
      evidenceType: "documented_fact",
      confidenceLabel: "high",
      confidenceRationale: "Directly supported by 3 independent sources, including a primary source.",
      verificationStatus: "corroborated",
      temporalStatus: "current",
      firstObservedDate: "2024-09-18",
      lastObservedDate: "2026-06-12",
    },
    [
      ev("demo-c1", 1, "demo-s2", "Dana Okafor-Lindqvist is Vice President of Product at Brightwater Mobility.", "primary"),
      ev("demo-c1", 2, "demo-s1", "I lead product at Brightwater Mobility", "primary"),
      ev("demo-c1", 3, "demo-s3", "Brightwater Mobility has appointed Dana Okafor-Lindqvist as vice president of product.", "secondary"),
    ],
  ),
  claim(
    "demo-c2",
    "She previously led the planning tools team at Nordline Freight.",
    {
      category: "past_role",
      evidenceType: "documented_fact",
      confidenceLabel: "high",
      confidenceRationale: "Directly supported by 2 independent sources, including a primary source.",
      verificationStatus: "corroborated",
      temporalStatus: "historical",
      firstObservedDate: "2023-01-15",
      lastObservedDate: "2024-09-18",
    },
    [
      ev("demo-c2", 1, "demo-s8", "Dana Okafor-Lindqvist — Head of Planning Tools.", "primary"),
      ev("demo-c2", 2, "demo-s3", "She joins from Nordline Freight, where she led the planning tools team.", "secondary"),
    ],
  ),
  claim(
    "demo-c3",
    "She gave a keynote on accessibility as a product requirement at Open Transit Summit 2025.",
    {
      category: "achievement",
      evidenceType: "documented_fact",
      confidenceLabel: "low",
      confidenceRationale: "Supported by a single secondary or user-generated source.",
      verificationStatus: "single_source",
      temporalStatus: "historical",
      firstObservedDate: "2025-05-10",
      lastObservedDate: "2025-05-10",
      limitations: "Speaker listing only; the talk itself was not reviewed.",
    },
    [ev("demo-c3", 1, "demo-s5", "Keynote: Accessibility as a product requirement.", "secondary")],
  ),
  claim(
    "demo-c4",
    "She states that Brightwater publishes its routing benchmarks so agencies can compare vendors on evidence.",
    {
      category: "stated_value",
      evidenceType: "self_statement",
      confidenceLabel: "high",
      confidenceRationale: "Stated by the person in a primary source. High confidence that they said it; it reflects their own account.",
      verificationStatus: "single_source",
      firstObservedDate: "2025-11-03",
      lastObservedDate: "2025-11-03",
    },
    [ev("demo-c4", 1, "demo-s6", "We publish our routing benchmarks because transit agencies deserve to compare vendors on evidence, not slideware.", "primary")],
  ),
  claim(
    "demo-c5",
    "Her professional profile lists Nordline Freight employment from 2019 to 2024.",
    {
      category: "past_role",
      evidenceType: "self_statement",
      confidenceLabel: "low",
      confidenceRationale: "Supported by a single secondary or user-generated source. Other sources conflict with this; see conflicting claims.",
      verificationStatus: "conflicting",
      temporalStatus: "historical",
      conflictGroup: "nordline_dates",
      limitations: "Verified against the search snippet only.",
    },
    [{ ...ev("demo-c5", 1, "demo-s7", "Previously Nordline Freight (2019–2024).", "user_generated"), notes: "Verified against the search snippet only." }],
  ),
  claim(
    "demo-c6",
    "An archived Nordline Freight team page from January 2023 lists her as Head of Planning Tools, while the 2024 news report says she joined Brightwater in September 2024.",
    {
      category: "past_role",
      evidenceType: "documented_fact",
      confidenceLabel: "moderate",
      confidenceRationale: "Supported by a single primary source; not independently corroborated. Other sources conflict with this; see conflicting claims.",
      verificationStatus: "conflicting",
      temporalStatus: "historical",
      conflictGroup: "nordline_dates",
    },
    [ev("demo-c6", 1, "demo-s8", "Dana Okafor-Lindqvist — Head of Planning Tools.", "primary")],
  ),
];

const section = (sectionType: SectionRow["sectionType"], content: Record<string, unknown>, userOverride: string | null = null): SectionRow => ({
  id: `demo-${sectionType}`,
  projectId: "demo",
  personId: "demo-person",
  jobId: "demo-job",
  sectionType,
  content,
  version: 1,
  isCurrent: true,
  userOverride,
  userOverrideAt: userOverride ? "2026-10-02T08:00:00Z" : null,
  generatedAt: "2026-10-01T09:30:00Z",
  modelMetadata: { model: "fictional demo" },
});

export const DEMO_SECTIONS: SectionRow[] = [
  section("overview", {
    summary:
      "Dana Okafor-Lindqvist is a product executive in transit software. Public sources consistently document her current role leading product at Brightwater Mobility and an earlier role building planning tools at Nordline Freight. She speaks and writes publicly about accessibility and evidence-based vendor evaluation.",
    current_role: { text: "Vice President of Product, Brightwater Mobility", claim_ids: ["demo-c1"] },
    key_points: [
      { text: "Leads product for routing software used by city bus networks.", claim_ids: ["demo-c1"] },
      { text: "Previously led the planning tools team at Nordline Freight.", claim_ids: ["demo-c2"] },
      { text: "Publicly advocates publishing routing benchmarks so agencies can compare vendors.", claim_ids: ["demo-c4"] },
    ],
    limitations: ["Exact dates of the move from Nordline Freight conflict between sources.", "No education history was found in public sources."],
  }),
  section("background", {
    summary: "A product career focused on planning and routing software for transport operators.",
    positions: [
      { title: "Vice President of Product", organization: "Brightwater Mobility", period: "Sept 2024 – present", status: "current", claim_ids: ["demo-c1"] },
      { title: "Head of Planning Tools", organization: "Nordline Freight", period: "c. 2019 – 2024 (dates conflict)", status: "historical", claim_ids: ["demo-c2", "demo-c5"] },
    ],
    education: [],
    achievements: [{ text: "Keynote speaker, Open Transit Summit 2025.", claim_ids: ["demo-c3"] }],
    publications: [{ text: "“Why we publish our routing benchmarks” (2025).", claim_ids: ["demo-c4"] }],
    projects: [],
  }),
  section("interests", {
    summary: "Accessibility in transit products and transparent, evidence-based software evaluation recur across her public work.",
    topics: [
      { topic: "Accessibility in transit software", description: "Raised in a podcast interview and a conference keynote.", kind: "professional_topic", source_ids: ["demo-s4", "demo-s5"], source_count: 2, recurring: true, most_recent_date: "2026-02-20" },
      { topic: "Transparent benchmarking", description: "Discussed in her own writing and the podcast.", kind: "professional_topic", source_ids: ["demo-s6", "demo-s4"], source_count: 2, recurring: true, most_recent_date: "2026-02-20" },
      { topic: "Freight planning", description: "Appears only in relation to a former role.", kind: "industry", source_ids: ["demo-s8"], source_count: 1, recurring: false, most_recent_date: "2023-01-15" },
    ],
    limitations: ["Topics found in only one source are shown as single mentions, not recurring interests."],
  }),
  section("communication", {
    summary: "Her public writing is concise and uses plain, non-technical language with concrete examples.",
    observations: [
      { dimension: "length", observation: "Short, declarative sentences in her own writing.", source_ids: ["demo-s6"] },
      { dimension: "vocabulary", observation: "Avoids jargon; frames technical topics around riders and agencies.", source_ids: ["demo-s4", "demo-s6"] },
    ],
    limitations: ["Based on two pieces of public content; tone may differ in private meetings."],
  }),
  section("visual_style", { ...VISUAL_STYLE_UNAVAILABLE }),
  section("values", {
    summary: "She explicitly frames accessibility and transparency as product principles.",
    items: [
      { idea: "Transit software should be invisible to riders", kind: "direct_quote", quote: "The best transit software is the kind riders never notice", source_id: "demo-s4", note: null },
      { idea: "Vendors should be compared on published evidence", kind: "direct_quote", quote: "transit agencies deserve to compare vendors on evidence, not slideware", source_id: "demo-s6", note: null },
      { idea: "Accessibility is a product requirement, not an add-on", kind: "paraphrase", quote: null, source_id: "demo-s5", note: null },
    ],
  }),
  section("relationships", {
    summary: "Documented professional affiliations only.",
    items: [
      { counterpart: "Brightwater Mobility", relationship: "employer", description: "Current employer.", claim_ids: ["demo-c1"] },
      { counterpart: "Nordline Freight", relationship: "employer", description: "Former employer.", claim_ids: ["demo-c2"] },
    ],
  }),
  section("recent", {
    summary: "Recent public activity centres on accessibility and benchmarking.",
    items: [
      { summary: "Podcast interview on designing transit software riders never notice.", source_id: "demo-s4", published_at: "2026-02-20", reported_event_date: null, why_it_may_matter: "Signals current priorities you can connect to in conversation." },
      { summary: "Published an essay on why Brightwater shares routing benchmarks.", source_id: "demo-s6", published_at: "2025-11-03", reported_event_date: null, why_it_may_matter: "Relevant if you plan to discuss product comparisons or evaluations." },
    ],
  }),
  section("open_questions", {
    missing_information: ["Education and credentials are not publicly documented."],
    conflicting_information: ["Start and end dates at Nordline Freight differ between her profile snippet and other sources."],
    needs_verification: ["Keynote content (only the speaker listing was available)."],
    questions_to_ask: ["What does accessibility testing with riders look like in practice at Brightwater?", "How do agencies use the published benchmarks when choosing vendors?"],
    insufficient_evidence_areas: ["Visual style (image analysis not enabled)."],
  }),
];

export const DEMO_QUALITY: QualityReport = {
  sourcesFound: 9,
  sourcesRetrieved: 6,
  sourcesSnippetOnly: 1,
  sourcesNotPermitted: 1,
  sourcesFailed: 0,
  sourcesAnalysed: 8,
  sourcesUnrelated: 1,
  sourceCategories: { personal_website: 1, company_website: 2, news: 1, podcast: 1, conference: 1, publication: 1, professional_network: 1 },
  queriesRun: 8,
  queriesFailed: 0,
  claimsExtracted: 6,
  claimsRejected: 1,
  claimsByConfidence: { high: 3, moderate: 1, low: 2, insufficient: 0 },
  conflicts: [{ key: "nordline_dates", description: "Dates at Nordline Freight differ between the professional profile snippet and the archived team page / news report." }],
  insufficientSections: ["Visual style"],
  limitations: [
    "1 proposed claim was discarded because the supporting text could not be found in the cited source.",
    "Coverage is limited to what the configured search provider returns. Social networks and login-protected pages are not searched directly, and completeness is not guaranteed.",
  ],
  unavailableProviders: [],
  reliesOnSnippetsOnly: false,
};

export const DEMO_BRIEF: StoredMeetingBrief = {
  executive_summary:
    "You are meeting a product leader at a transit software company to explore a data partnership. Her public work emphasises accessibility and transparent benchmarking — both natural bridges to an evidence-led partnership pitch.",
  key_facts: [
    { fact: "She is VP Product at Brightwater Mobility.", claim_ids: ["demo-c1"] },
    { fact: "She previously built planning tools at Nordline Freight.", claim_ids: ["demo-c2"] },
    { fact: "She argues vendors should be compared on published benchmarks.", claim_ids: ["demo-c4"] },
    { fact: "She keynoted on accessibility as a product requirement (2025).", claim_ids: ["demo-c3"] },
  ],
  conversation_topics: [
    { topic: "Rider-facing accessibility", rationale: "A recurring theme in her talks and interviews.", claim_ids: ["demo-c3"] },
    { topic: "Benchmark transparency", rationale: "She has written about why Brightwater publishes benchmarks.", claim_ids: ["demo-c4"] },
    { topic: "Planning tools for operators", rationale: "Connects to her previous role.", claim_ids: ["demo-c2"] },
  ],
  questions: [
    { question: "Which accessibility metrics matter most to your agency customers today?", rationale: "Grounded in her public focus.", claim_ids: ["demo-c3"] },
    { question: "How do agencies use your published benchmarks in procurement?", rationale: "Builds on her essay.", claim_ids: ["demo-c4"] },
    { question: "What would a successful data partnership look like in its first six months?", rationale: "Clarifies expectations.", claim_ids: [] },
    { question: "Who else is typically involved in partnership decisions?", rationale: "Clarifies the decision process.", claim_ids: [] },
    { question: "Which lessons from planning tools at Nordline carried over to Brightwater?", rationale: "Opens a conversation about her background.", claim_ids: ["demo-c2"] },
  ],
  professional_overlap: [{ point: "Shared interest in measurable, evidence-based product evaluation.", claim_ids: ["demo-c4"] }],
  recent_developments: [{ summary: "Recent podcast on invisible, rider-friendly transit software (Feb 2026).", claim_ids: ["demo-c1"] }],
  unknowns_to_clarify: ["Her budget authority and decision process for partnerships.", "Exact timeline of her move from Nordline Freight (sources conflict)."],
  documented_risks: [],
  suggested_opening: "“I enjoyed your piece on publishing routing benchmarks — we take a similar evidence-first approach, and I’d love to hear how agencies respond to it.”",
  checklist: ["Re-read her benchmarks essay.", "Prepare one accessibility-related data example.", "Confirm meeting attendees and agenda.", "Decide what you need to learn before committing."],
  dropped_unsupported: 0,
  evidence_note: null,
};
