import { z } from "zod";

/**
 * Zod schemas for every structured AI output. Models refer to sources and
 * claims only by opaque IDs ("S3", "C12"). They never emit URLs, so they
 * cannot fabricate links: URLs always come from stored search results.
 */

const sourceRef = z.string().regex(/^S\d{1,3}$/, "source ids look like S1");
const claimRef = z.string().regex(/^C\d{1,4}$/, "claim ids look like C1");
const shortText = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

export const identityResolutionSchema = z.object({
  candidates: z
    .array(
      z.object({
        id: z.string().regex(/^P\d{1,2}$/),
        label: shortText(200),
        description: shortText(600),
        distinguishing_attributes: z.array(shortText(200)).max(8),
        match_reasons: z.array(shortText(300)).max(6),
        source_ids: z.array(sourceRef).min(1).max(20),
        matches_user_identifiers: z.enum(["strong", "partial", "weak", "none"]),
      }),
    )
    .max(6),
  decision: z.enum(["single_clear_match", "ambiguous", "no_credible_match"]),
  selected_candidate_id: z.string().nullable(),
  reasoning: shortText(1000),
});
export type IdentityResolution = z.infer<typeof identityResolutionSchema>;

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

export const CLAIM_CATEGORIES = [
  "current_role",
  "past_role",
  "organization",
  "education",
  "achievement",
  "project",
  "publication",
  "professional_relationship",
  "interest_topic",
  "stated_value",
  "public_statement",
  "recent_development",
  "location",
  "other",
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const EVIDENCE_TYPES = [
  "documented_fact",
  "self_statement",
  "secondary_report",
  "interpretation",
  "hypothesis",
  "unknown",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const claimExtractionSchema = z.object({
  source_assessments: z
    .array(
      z.object({
        source_id: sourceRef,
        relevance: z.enum(["about_person", "possibly_about_person", "unrelated"]),
        reason: shortText(300),
      }),
    )
    .max(100),
  claims: z
    .array(
      z.object({
        claim_text: shortText(500),
        category: z.enum(CLAIM_CATEGORIES),
        evidence_type: z.enum(EVIDENCE_TYPES),
        temporal_status: z.enum(["current", "historical", "unknown"]),
        as_of_date: z.string().max(20).nullable(),
        evidence: z
          .array(
            z.object({
              source_id: sourceRef,
              excerpt: shortText(600),
              relationship: z.enum(["supports", "contradicts", "context"]),
              support_strength: z.enum(["direct", "partial", "indirect"]),
            }),
          )
          .min(1)
          .max(6),
        conflict_key: z.string().max(60).nullable(),
        limitations: z.string().max(400).nullable(),
      }),
    )
    .max(80),
  conflicts: z
    .array(z.object({ conflict_key: z.string().min(1).max(60), description: shortText(500) }))
    .max(20),
});
export type ClaimExtraction = z.infer<typeof claimExtractionSchema>;

// ---------------------------------------------------------------------------
// Profile sections
// ---------------------------------------------------------------------------

const cited = z.object({ text: shortText(600), claim_ids: z.array(claimRef).max(8) });

export const overviewSectionSchema = z.object({
  summary: shortText(1500),
  current_role: cited.nullable(),
  key_points: z.array(cited).max(8),
  limitations: z.array(shortText(300)).max(6),
});

export const backgroundSectionSchema = z.object({
  summary: shortText(1200),
  positions: z
    .array(
      z.object({
        title: shortText(200),
        organization: shortText(200),
        period: z.string().max(80).nullable(),
        status: z.enum(["current", "historical", "unknown"]),
        claim_ids: z.array(claimRef).min(1).max(6),
      }),
    )
    .max(20),
  education: z.array(cited).max(8),
  achievements: z.array(cited).max(10),
  publications: z.array(cited).max(10),
  projects: z.array(cited).max(10),
});

export const interestsSectionSchema = z.object({
  summary: shortText(1000),
  topics: z
    .array(
      z.object({
        topic: shortText(120),
        description: shortText(400),
        kind: z.enum(["professional_topic", "industry", "project", "activity"]),
        source_ids: z.array(sourceRef).min(1).max(12),
      }),
    )
    .max(12),
  limitations: z.array(shortText(300)).max(5),
});

export const communicationSectionSchema = z.object({
  summary: shortText(800),
  observations: z
    .array(
      z.object({
        dimension: z.enum(["formality", "length", "vocabulary", "themes", "format", "other"]),
        observation: shortText(400),
        source_ids: z.array(sourceRef).min(1).max(8),
      }),
    )
    .max(8),
  limitations: z.array(shortText(300)).max(5),
});

export const valuesSectionSchema = z.object({
  summary: shortText(800),
  items: z
    .array(
      z.object({
        idea: shortText(300),
        kind: z.enum(["direct_quote", "paraphrase"]),
        quote: z.string().max(600).nullable(),
        source_id: sourceRef,
      }),
    )
    .max(10),
});

export const relationshipsSectionSchema = z.object({
  summary: shortText(800),
  items: z
    .array(
      z.object({
        counterpart: shortText(200),
        relationship: z.enum(["co_founder", "employer", "colleague", "board", "co_author", "collaborator", "investor", "advisor", "partner_organization", "other"]),
        description: shortText(300),
        claim_ids: z.array(claimRef).min(1).max(6),
      }),
    )
    .max(15),
});

export const recentSectionSchema = z.object({
  summary: shortText(800),
  items: z
    .array(
      z.object({
        summary: shortText(400),
        source_id: sourceRef,
        reported_event_date: z.string().max(20).nullable(),
        why_it_may_matter: shortText(300),
      }),
    )
    .max(10),
});

export const openQuestionsSectionSchema = z.object({
  missing_information: z.array(shortText(300)).max(10),
  conflicting_information: z.array(shortText(300)).max(10),
  needs_verification: z.array(shortText(300)).max(10),
  questions_to_ask: z.array(shortText(300)).max(10),
  insufficient_evidence_areas: z.array(shortText(300)).max(10),
});

export const profileSchema = z.object({
  overview: overviewSectionSchema,
  background: backgroundSectionSchema,
  interests: interestsSectionSchema,
  communication: communicationSectionSchema,
  values: valuesSectionSchema,
  relationships: relationshipsSectionSchema,
  recent: recentSectionSchema,
  open_questions: openQuestionsSectionSchema,
});
export type GeneratedProfile = z.infer<typeof profileSchema>;

export const PROFILE_SECTION_TYPES = [
  "overview",
  "background",
  "interests",
  "communication",
  "visual_style",
  "values",
  "relationships",
  "recent",
  "open_questions",
] as const;
export type ProfileSectionType = (typeof PROFILE_SECTION_TYPES)[number];
export type GeneratedSectionType = keyof GeneratedProfile;

export const GENERATED_SECTION_TYPES = Object.keys(profileSchema.shape) as GeneratedSectionType[];

export const SECTION_LABELS: Record<ProfileSectionType, string> = {
  overview: "Executive overview",
  background: "Professional background",
  interests: "Interests & recurring topics",
  communication: "Public communication style",
  visual_style: "Visual style",
  values: "Publicly expressed values & ideas",
  relationships: "Professional relationships",
  recent: "Recent developments",
  open_questions: "Open questions",
};

// ---------------------------------------------------------------------------
// Meeting brief
// ---------------------------------------------------------------------------

export const meetingBriefSchema = z.object({
  executive_summary: shortText(1200),
  key_facts: z.array(z.object({ fact: shortText(400), claim_ids: z.array(claimRef).min(1).max(6) })).max(5),
  conversation_topics: z
    .array(z.object({ topic: shortText(200), rationale: shortText(400), claim_ids: z.array(claimRef).max(6) }))
    .max(5),
  questions: z
    .array(z.object({ question: shortText(400), rationale: shortText(300), claim_ids: z.array(claimRef).max(6) }))
    .max(7),
  professional_overlap: z.array(z.object({ point: shortText(400), claim_ids: z.array(claimRef).max(6) })).max(6),
  recent_developments: z.array(z.object({ summary: shortText(400), claim_ids: z.array(claimRef).min(1).max(6) })).max(5),
  unknowns_to_clarify: z.array(shortText(300)).max(8),
  documented_risks: z.array(z.object({ risk: shortText(400), claim_ids: z.array(claimRef).min(1).max(6) })).max(5),
  suggested_opening: shortText(600),
  checklist: z.array(shortText(200)).max(10),
});
export type MeetingBrief = z.infer<typeof meetingBriefSchema>;
