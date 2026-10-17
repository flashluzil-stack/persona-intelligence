import type { ClaimRow, EvidenceRow, JobRow, ProjectRow, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";

/* Row mappers between Postgres snake_case rows and application types. */

type Row = Record<string, unknown>;

export const mapProject = (r: Row): ProjectRow => ({
  id: r.id as string,
  userId: r.user_id as string,
  name: r.name as string,
  researchObjective: (r.research_objective as string | null) ?? null,
  input: r.input as ProjectRow["input"],
  status: r.status as ProjectRow["status"],
  personId: (r.person_id as string | null) ?? null,
  lastResearchedAt: (r.last_researched_at as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export const mapJob = (r: Row): JobRow => ({
  id: r.id as string,
  userId: r.user_id as string,
  projectId: r.research_project_id as string,
  kind: r.kind as JobRow["kind"],
  status: r.status as JobRow["status"],
  currentStage: (r.current_stage as JobRow["currentStage"]) ?? null,
  progress: (r.progress as JobRow["progress"]) ?? [],
  identity: (r.identity as JobRow["identity"]) ?? {},
  errorDetails: (r.error_details as JobRow["errorDetails"]) ?? null,
  qualityReport: (r.quality_report as JobRow["qualityReport"]) ?? null,
  usage: (r.usage as JobRow["usage"]) ?? {},
  heartbeatAt: (r.heartbeat_at as string | null) ?? null,
  startedAt: (r.started_at as string | null) ?? null,
  completedAt: (r.completed_at as string | null) ?? null,
  createdAt: r.created_at as string,
});

export const jobPatchToRow = (patch: Partial<JobRow>): Row => {
  const out: Row = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.currentStage !== undefined) out.current_stage = patch.currentStage;
  if (patch.progress !== undefined) out.progress = patch.progress;
  if (patch.identity !== undefined) out.identity = patch.identity;
  if (patch.errorDetails !== undefined) out.error_details = patch.errorDetails;
  if (patch.qualityReport !== undefined) out.quality_report = patch.qualityReport;
  if (patch.usage !== undefined) out.usage = patch.usage;
  if (patch.heartbeatAt !== undefined) out.heartbeat_at = patch.heartbeatAt;
  if (patch.startedAt !== undefined) out.started_at = patch.startedAt;
  if (patch.completedAt !== undefined) out.completed_at = patch.completedAt;
  if (patch.kind !== undefined) out.kind = patch.kind;
  return out;
};

export const mapSource = (r: Row): SourceRecord => ({
  id: r.id as string,
  url: r.url as string,
  normalizedUrl: r.normalized_url as string,
  title: (r.title as string | null) ?? null,
  domain: r.domain as string,
  sourceType: r.source_type as SourceRecord["sourceType"],
  author: (r.author as string | null) ?? null,
  publishedAt: (r.published_at as string | null) ?? null,
  accessedAt: r.accessed_at as string,
  excerpt: (r.excerpt as string | null) ?? null,
  contentText: (r.content_text as string | null) ?? null,
  retrievalStatus: r.retrieval_status as SourceRecord["retrievalStatus"],
  retrievalNote: (r.retrieval_note as string | null) ?? null,
  relevance: r.relevance as SourceRecord["relevance"],
  provider: r.provider as string,
  metadata: (r.metadata as Record<string, unknown>) ?? {},
});

export const sourceToRow = (s: Partial<SourceRecord>): Row => {
  const out: Row = {};
  if (s.url !== undefined) out.url = s.url;
  if (s.normalizedUrl !== undefined) out.normalized_url = s.normalizedUrl;
  if (s.title !== undefined) out.title = s.title?.slice(0, 500) ?? null;
  if (s.domain !== undefined) out.domain = s.domain;
  if (s.sourceType !== undefined) out.source_type = s.sourceType;
  if (s.author !== undefined) out.author = s.author?.slice(0, 300) ?? null;
  if (s.publishedAt !== undefined) out.published_at = s.publishedAt;
  if (s.accessedAt !== undefined) out.accessed_at = s.accessedAt;
  if (s.excerpt !== undefined) out.excerpt = s.excerpt?.slice(0, 4000) ?? null;
  if (s.contentText !== undefined) out.content_text = s.contentText?.slice(0, 60_000) ?? null;
  if (s.retrievalStatus !== undefined) out.retrieval_status = s.retrievalStatus;
  if (s.retrievalNote !== undefined) out.retrieval_note = s.retrievalNote?.slice(0, 500) ?? null;
  if (s.relevance !== undefined) out.relevance = s.relevance;
  if (s.provider !== undefined) out.provider = s.provider;
  if (s.metadata !== undefined) out.metadata = s.metadata;
  return out;
};

export const mapEvidence = (r: Row): EvidenceRow => ({
  id: r.id as string,
  claimId: r.claim_id as string,
  sourceId: r.source_id as string,
  supportingExcerpt: r.supporting_excerpt as string,
  relationship: r.evidence_relationship as EvidenceRow["relationship"],
  sourceCredibility: r.source_credibility as EvidenceRow["sourceCredibility"],
  supportStrength: r.support_strength as EvidenceRow["supportStrength"],
  notes: (r.notes as string | null) ?? null,
});

export const mapClaim = (r: Row): ClaimRow => ({
  id: r.id as string,
  projectId: r.research_project_id as string,
  jobId: (r.job_id as string | null) ?? null,
  personId: (r.person_id as string | null) ?? null,
  claimText: r.claim_text as string,
  category: r.category as ClaimRow["category"],
  evidenceType: r.evidence_type as ClaimRow["evidenceType"],
  confidenceLabel: r.confidence_label as ClaimRow["confidenceLabel"],
  confidenceRationale: r.confidence_rationale as string,
  verificationStatus: r.verification_status as ClaimRow["verificationStatus"],
  temporalStatus: r.temporal_status as ClaimRow["temporalStatus"],
  conflictGroup: (r.conflict_group as string | null) ?? null,
  limitations: (r.limitations as string | null) ?? null,
  firstObservedDate: (r.first_observed_date as string | null) ?? null,
  lastObservedDate: (r.last_observed_date as string | null) ?? null,
  createdAt: r.created_at as string,
  evidence: ((r.claim_evidence as Row[] | undefined) ?? []).map(mapEvidence),
});

export const mapSection = (r: Row): SectionRow => ({
  id: r.id as string,
  projectId: r.research_project_id as string,
  personId: (r.person_id as string | null) ?? null,
  jobId: (r.job_id as string | null) ?? null,
  sectionType: r.section_type as SectionRow["sectionType"],
  content: r.structured_content as Record<string, unknown>,
  version: r.version as number,
  isCurrent: r.is_current as boolean,
  userOverride: (r.user_override as string | null) ?? null,
  userOverrideAt: (r.user_override_at as string | null) ?? null,
  generatedAt: r.generated_at as string,
  modelMetadata: (r.model_metadata as Record<string, unknown>) ?? {},
});
