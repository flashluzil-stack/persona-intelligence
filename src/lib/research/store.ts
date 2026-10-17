import type { ClaimCategory, EvidenceType, ProfileSectionType } from "@/lib/ai/schemas";
import type { ResearchInput } from "@/lib/validation/schemas";
import type { ConfidenceLabel, VerificationStatus } from "./evidence";
import type {
  JobStatus,
  Relevance,
  ResearchStage,
  RetrievalStatus,
  SourceCredibility,
  SourceRecord,
  SourceType,
  StageLogEntry,
  UsageRecord,
} from "./types";

/**
 * Persistence boundary for the research engine. The Supabase implementation
 * (db/supabase-store.ts) runs with the signed-in user's JWT so Row Level
 * Security applies to every query; tests use an in-memory implementation.
 */

export interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  researchObjective: string | null;
  input: ResearchInput;
  status: JobStatus;
  personId: string | null;
  lastResearchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityCandidate {
  id: string;
  label: string;
  description: string;
  attributes: string[];
  matchReasons: string[];
  matchStrength: "strong" | "partial" | "weak" | "none";
  sources: Array<{ url: string; title: string | null; domain: string; normalizedUrl: string }>;
}

export interface IdentityState {
  method?: "ai" | "heuristic";
  decision?: "single_clear_match" | "ambiguous" | "no_credible_match";
  reasoning?: string;
  candidates?: IdentityCandidate[];
  selected?: {
    candidateId: string;
    label: string;
    description: string;
    confirmedBy: "user" | "automatic";
    additionalContext?: string;
    sourceNormalizedUrls: string[];
  };
}

export interface JobError {
  stage: ResearchStage;
  code: string;
  message: string;
}

export interface QualityReport {
  sourcesFound: number;
  sourcesRetrieved: number;
  sourcesSnippetOnly: number;
  sourcesNotPermitted: number;
  sourcesFailed: number;
  sourcesAnalysed: number;
  sourcesUnrelated: number;
  sourceCategories: Record<string, number>;
  queriesRun: number;
  queriesFailed: number;
  claimsExtracted: number;
  claimsRejected: number;
  claimsByConfidence: Record<ConfidenceLabel, number>;
  conflicts: Array<{ key: string; description: string }>;
  insufficientSections: string[];
  limitations: string[];
  unavailableProviders: string[];
  reliesOnSnippetsOnly: boolean;
}

export interface UsageTotals {
  searchQueries?: number;
  pageFetches?: number;
  aiCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface JobRow {
  id: string;
  userId: string;
  projectId: string;
  kind: "initial" | "refresh";
  status: JobStatus;
  currentStage: ResearchStage | null;
  progress: StageLogEntry[];
  identity: IdentityState;
  errorDetails: JobError | null;
  qualityReport: QualityReport | null;
  usage: UsageTotals;
  heartbeatAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface NewSource {
  url: string;
  normalizedUrl: string;
  title: string | null;
  domain: string;
  sourceType: SourceType;
  author: string | null;
  publishedAt: string | null;
  accessedAt: string;
  excerpt: string | null;
  contentText: string | null;
  retrievalStatus: RetrievalStatus;
  retrievalNote: string | null;
  relevance: Relevance;
  provider: string;
  metadata: Record<string, unknown>;
}

export interface EvidenceRow {
  id: string;
  claimId: string;
  sourceId: string;
  supportingExcerpt: string;
  relationship: "supports" | "contradicts" | "context";
  sourceCredibility: SourceCredibility;
  supportStrength: "direct" | "partial" | "indirect";
  notes: string | null;
}

export interface ClaimRow {
  id: string;
  projectId: string;
  jobId: string | null;
  personId: string | null;
  claimText: string;
  category: ClaimCategory;
  evidenceType: EvidenceType;
  confidenceLabel: ConfidenceLabel;
  confidenceRationale: string;
  verificationStatus: VerificationStatus;
  temporalStatus: "current" | "historical" | "unknown";
  conflictGroup: string | null;
  limitations: string | null;
  firstObservedDate: string | null;
  lastObservedDate: string | null;
  createdAt: string;
  evidence: EvidenceRow[];
}

export type NewClaim = Omit<ClaimRow, "id" | "createdAt" | "evidence" | "projectId" | "jobId" | "personId"> & {
  evidence: Array<Omit<EvidenceRow, "id" | "claimId">>;
};

export interface SectionRow {
  id: string;
  projectId: string;
  personId: string | null;
  jobId: string | null;
  sectionType: ProfileSectionType;
  content: Record<string, unknown>;
  version: number;
  isCurrent: boolean;
  userOverride: string | null;
  userOverrideAt: string | null;
  generatedAt: string;
  modelMetadata: Record<string, unknown>;
}

export interface NewSection {
  sectionType: ProfileSectionType;
  content: Record<string, unknown>;
  modelMetadata: Record<string, unknown>;
}

export interface ResearchStore {
  getProject(projectId: string): Promise<ProjectRow | null>;
  getJob(jobId: string): Promise<JobRow | null>;
  updateJob(jobId: string, patch: Partial<Omit<JobRow, "id" | "userId" | "projectId" | "createdAt">>): Promise<void>;
  updateProject(projectId: string, patch: Partial<Pick<ProjectRow, "status" | "personId" | "lastResearchedAt">>): Promise<void>;
  ensurePerson(
    project: ProjectRow,
    attrs: { displayName: string; description: string | null; identityStatus: string; attributes: Record<string, unknown> },
  ): Promise<string>;
  upsertSources(projectId: string, jobId: string, sources: NewSource[]): Promise<SourceRecord[]>;
  updateSource(sourceId: string, patch: Partial<NewSource>): Promise<void>;
  listSources(projectId: string): Promise<SourceRecord[]>;
  insertClaims(projectId: string, jobId: string, personId: string | null, claims: NewClaim[]): Promise<ClaimRow[]>;
  deleteJobClaims(jobId: string): Promise<void>;
  listClaims(projectId: string, jobId: string): Promise<ClaimRow[]>;
  /** Saves new section versions, marking previous ones not current. User overrides carry over. */
  saveSections(projectId: string, personId: string | null, jobId: string, sections: NewSection[]): Promise<SectionRow[]>;
  listCurrentSections(projectId: string): Promise<SectionRow[]>;
  recordUsage(jobId: string, usage: UsageRecord[]): Promise<void>;
  audit(eventType: string, metadata: Record<string, unknown>): Promise<void>;
}
