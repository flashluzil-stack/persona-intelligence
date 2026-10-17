/**
 * Central, server-side configuration. Secrets are read from process.env only
 * here and never re-exported to client components. `getPublicConfig()` is the
 * only shape that may cross the server/client boundary.
 */

export type SearchProviderId = "brave" | "tavily";

export interface ResearchLimits {
  /** Targeted search queries per research job (identity + source search). */
  maxQueriesPerJob: number;
  /** Results requested per search query. */
  resultsPerQuery: number;
  /** Distinct sources kept per job after deduplication. */
  maxSourcesPerJob: number;
  /** Sources whose full page content is retrieved (when permitted). */
  maxPageFetchesPerJob: number;
  /** Maximum bytes read from any single page. */
  maxPageBytes: number;
  /** Maximum characters of extracted text stored/analysed per source. */
  maxContentChars: number;
  /** AI calls per research job (extraction, profile, quality). */
  maxAiCallsPerJob: number;
  /** Bounded retries for provider calls. */
  maxRetries: number;
  /** Per-request timeout for provider HTTP calls (ms). */
  providerTimeoutMs: number;
  /** Wall-clock budget for a whole research job (ms). */
  jobTimeoutMs: number;
  /** Concurrent queued/running jobs per user. */
  maxConcurrentJobsPerUser: number;
  /** Default research jobs per user per rolling 24 hours (overridable per user). */
  defaultDailyResearchQuota: number;
  /** Meeting briefs per user per rolling 24 hours. */
  dailyBriefQuota: number;
}

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function getResearchLimits(): ResearchLimits {
  return {
    maxQueriesPerJob: intFromEnv("RESEARCH_MAX_QUERIES", 8, 1, 30),
    resultsPerQuery: intFromEnv("RESEARCH_RESULTS_PER_QUERY", 8, 1, 20),
    maxSourcesPerJob: intFromEnv("RESEARCH_MAX_SOURCES", 25, 1, 100),
    maxPageFetchesPerJob: intFromEnv("RESEARCH_MAX_PAGE_FETCHES", 12, 0, 50),
    maxPageBytes: intFromEnv("RESEARCH_MAX_PAGE_BYTES", 1_500_000, 50_000, 10_000_000),
    maxContentChars: intFromEnv("RESEARCH_MAX_CONTENT_CHARS", 12_000, 1_000, 60_000),
    maxAiCallsPerJob: intFromEnv("RESEARCH_MAX_AI_CALLS", 8, 1, 40),
    maxRetries: intFromEnv("RESEARCH_MAX_RETRIES", 2, 0, 5),
    providerTimeoutMs: intFromEnv("RESEARCH_PROVIDER_TIMEOUT_MS", 15_000, 1_000, 120_000),
    jobTimeoutMs: intFromEnv("RESEARCH_JOB_TIMEOUT_MS", 240_000, 10_000, 900_000),
    maxConcurrentJobsPerUser: intFromEnv("RESEARCH_MAX_CONCURRENT_JOBS", 2, 1, 10),
    defaultDailyResearchQuota: intFromEnv("RESEARCH_DAILY_QUOTA", 10, 0, 1000),
    dailyBriefQuota: intFromEnv("BRIEF_DAILY_QUOTA", 30, 0, 1000),
  };
}

/**
 * Supabase is only used server-side, so the runtime variables SUPABASE_URL /
 * SUPABASE_ANON_KEY are preferred (NEXT_PUBLIC_* values are frozen at build
 * time by Next.js). The anon/publishable key is not a secret, but it is still
 * never sent to the browser by this app.
 */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const env = process.env; // dynamic access: read at runtime, never inlined at build
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSearchProviderConfig(): { id: SearchProviderId; apiKey: string } | null {
  const preferred = process.env.SEARCH_PROVIDER?.toLowerCase();
  const brave = process.env.BRAVE_SEARCH_API_KEY;
  const tavily = process.env.TAVILY_API_KEY;
  if (preferred === "tavily" && tavily) return { id: "tavily", apiKey: tavily };
  if (preferred === "brave" && brave) return { id: "brave", apiKey: brave };
  if (!preferred || preferred === "auto") {
    if (brave) return { id: "brave", apiKey: brave };
    if (tavily) return { id: "tavily", apiKey: tavily };
  }
  return null;
}

export function getAnalysisProviderConfig(): { apiKey: string; model: string; baseUrl: string } | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  };
}

export type AppMode = "demo" | "search_only" | "analysis_only" | "fully_configured";

export interface PublicConfig {
  mode: AppMode;
  authConfigured: boolean;
  searchConfigured: boolean;
  searchProvider: SearchProviderId | null;
  analysisConfigured: boolean;
  analysisModel: string | null;
  pageRetrievalEnabled: boolean;
  imageAnalysisEnabled: boolean;
}

export function getPublicConfig(): PublicConfig {
  const search = getSearchProviderConfig();
  const analysis = getAnalysisProviderConfig();
  const mode: AppMode =
    search && analysis ? "fully_configured" : search ? "search_only" : analysis ? "analysis_only" : "demo";
  return {
    mode,
    authConfigured: getSupabaseConfig() !== null,
    searchConfigured: search !== null,
    searchProvider: search?.id ?? null,
    analysisConfigured: analysis !== null,
    analysisModel: analysis?.model ?? null,
    pageRetrievalEnabled: process.env.RESEARCH_DISABLE_PAGE_FETCH !== "true",
    // Image analysis is not implemented in this milestone; see README.
    imageAnalysisEnabled: false,
  };
}

export function getAppUrl(): string {
  const env = process.env;
  // On Vercel, fall back to the project's production domain so auth email links work without extra config.
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
  return (env.APP_URL || env.NEXT_PUBLIC_APP_URL || vercel || "http://localhost:3000").replace(/\/$/, "");
}

export const USER_AGENT =
  "PersonaIntelligenceBot/0.1 (+public-source research; respects robots.txt)";
