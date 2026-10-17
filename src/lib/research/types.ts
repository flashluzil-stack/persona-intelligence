import en, { type Messages } from "@/i18n/messages/en";

export type EngineMessages = Messages["engine"];

/**
 * Shared domain types for the research engine. Provider implementations,
 * the pipeline, persistence and the UI all speak these shapes.
 */

export const SOURCE_TYPES = [
  "personal_website",
  "company_website",
  "professional_network",
  "social_media",
  "news",
  "interview",
  "podcast",
  "video",
  "conference",
  "publication",
  "portfolio",
  "registry",
  "reference",
  "web_page",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type RetrievalStatus = "snippet_only" | "retrieved" | "not_permitted" | "blocked" | "failed";
export type Relevance = "unassessed" | "about_person" | "possibly_about_person" | "unrelated";
export type SourceCredibility = "primary" | "established_publication" | "secondary" | "user_generated" | "unknown";

export type JobStatus = "queued" | "running" | "needs_input" | "completed" | "partial" | "failed";

export const RESEARCH_STAGES = [
  "input_validation",
  "identity_discovery",
  "source_search",
  "deduplication",
  "source_retrieval",
  "fact_extraction",
  "claim_association",
  "conflict_analysis",
  "interest_analysis",
  "profile_generation",
  "meeting_brief",
  "save_and_quality",
] as const;
export type ResearchStage = (typeof RESEARCH_STAGES)[number];

export interface StageLogEntry {
  stage: ResearchStage;
  status: "running" | "done" | "skipped" | "warning" | "error";
  message: string;
  at: string;
}

/** Normalized search result, independent of provider. */
export interface SearchResult {
  url: string;
  normalizedUrl: string;
  title: string;
  domain: string;
  snippet: string;
  publishedAt: string | null;
  retrievedAt: string;
  sourceType: SourceType;
  provider: string;
  query: string;
}

/** A source as held in memory by the pipeline (persisted to `sources`). */
export interface SourceRecord {
  id: string;
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

export type ProviderErrorCode =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "network"
  | "bad_response"
  | "blocked"
  | "not_permitted"
  | "too_large"
  | "unsupported_content"
  | "invalid_output"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Message safe to show users and store; never includes keys or raw bodies. */
  toUserMessage(m: EngineMessages["provider"] = en.engine.provider): string {
    switch (this.code) {
      case "not_configured":
      case "unauthorized":
      case "rate_limited":
      case "quota_exceeded":
      case "timeout":
      case "network":
        return m[this.code](this.provider);
      default:
        return m.other(this.provider);
    }
  }
}

export interface SearchOptions {
  count: number;
  signal?: AbortSignal;
}

/** Provider-shaped hit after validation, before normalization/classification. */
export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
}

export interface SearchProvider {
  readonly id: string;
  readonly label: string;
  /** Returns validated hits. Throws ProviderError on failure. */
  search(query: string, options: SearchOptions): Promise<SearchHit[]>;
}

export interface RetrievedContent {
  finalUrl: string;
  title: string | null;
  description: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string;
  truncated: boolean;
}

export interface ContentProvider {
  retrieve(url: string, signal?: AbortSignal): Promise<RetrievedContent>;
}

export interface UsageRecord {
  kind: "search_query" | "page_fetch" | "ai_call";
  provider: string;
  units: number;
  inputTokens?: number;
  outputTokens?: number;
}
