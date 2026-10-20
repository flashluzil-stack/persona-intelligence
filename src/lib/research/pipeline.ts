import { GENERATED_SECTION_TYPES } from "@/lib/ai/schemas";
import type { ResearchLimits } from "@/lib/config";
import type { StructuredModel } from "@/lib/providers/analysis/openai";
import { normalizeHits } from "@/lib/providers/search";
import { SearchRouter } from "@/lib/providers/search/router";
import { researchInputSchema, type ResearchInput } from "@/lib/validation/schemas";
import { classifySource, isAutomatedRetrievalRestricted, sourceCredibility } from "./classify";
import { domainOf, normalizeUrl } from "@/lib/security/url";
import { dedupeResults, detectSyndication } from "./dedupe";
import { extractClaims } from "./extraction";
import { resolveIdentityHeuristically, resolveIdentityWithAI } from "./identity";
import { generateProfileSections, visualStyleUnavailable } from "./profile";
import { getMessages } from "@/i18n/messages";
import { buildQueryPlan, type PlannedQuery } from "./queries";
import { buildQualityReport } from "./quality";
import type { ClaimRow, IdentityState, JobError, JobRow, NewSource, ProjectRow, ResearchStore, UsageTotals } from "./store";
import {
  ProviderError,
  type ContentProvider,
  type ResearchStage,
  type SearchProvider,
  type SearchResult,
  type SourceCategoryStatus,
  type SourceRecord,
  type StageLogEntry,
  type UsageRecord,
} from "./types";

export interface PipelineDeps {
  store: ResearchStore;
  /** One provider, several (priority order, with failover), or a prepared router. */
  search: SearchRouter | SearchProvider | SearchProvider[] | null;
  content: ContentProvider | null;
  model: StructuredModel | null;
  limits: ResearchLimits;
  now?: () => Date;
}

class StageFailure extends Error {
  constructor(
    public readonly stage: ResearchStage,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TERMINAL = new Set(["completed", "partial", "failed"]);

/** Runs (or resumes) a research job. Safe to call repeatedly; terminal jobs are returned unchanged. */
export async function runResearchJob(jobId: string, deps: PipelineDeps): Promise<JobRow | null> {
  const { store, limits } = deps;
  const now = deps.now ?? (() => new Date());
  const job = await store.getJob(jobId);
  if (!job) return null;
  if (TERMINAL.has(job.status)) return job;
  if (job.status === "needs_input" && !job.identity.selected) return job;
  const project = await store.getProject(job.projectId);
  if (!project) return null;
  const language = project.input.locale === "he" ? "he" : "en";
  const messages = getMessages(language);
  const E = messages.engine;
  const router =
    deps.search instanceof SearchRouter
      ? deps.search
      : deps.search && (!Array.isArray(deps.search) || deps.search.length > 0)
        ? new SearchRouter(Array.isArray(deps.search) ? deps.search : [deps.search])
        : null;

  const progress: StageLogEntry[] = [...job.progress];
  const usage: UsageRecord[] = [];
  const totals: UsageTotals = { ...job.usage };
  const warnings: string[] = [];
  const unavailableProviders = new Set<string>();
  let aiCalls = totals.aiCalls ?? 0;
  let identity: IdentityState = job.identity;
  const signal = AbortSignal.timeout(limits.jobTimeoutMs);

  const log = async (stage: ResearchStage, status: StageLogEntry["status"], message: string) => {
    progress.push({ stage, status, message, at: now().toISOString() });
    await store.updateJob(jobId, { progress, currentStage: stage, heartbeatAt: now().toISOString() });
  };
  const track = (u: UsageRecord) => {
    usage.push(u);
    if (u.kind === "search_query") totals.searchQueries = (totals.searchQueries ?? 0) + u.units;
    if (u.kind === "page_fetch") totals.pageFetches = (totals.pageFetches ?? 0) + u.units;
    if (u.kind === "ai_call") {
      totals.aiCalls = (totals.aiCalls ?? 0) + 1;
      totals.inputTokens = (totals.inputTokens ?? 0) + (u.inputTokens ?? 0);
      totals.outputTokens = (totals.outputTokens ?? 0) + (u.outputTokens ?? 0);
    }
  };
  const consumeAiBudget = () => {
    if (aiCalls >= limits.maxAiCallsPerJob) {
      throw new StageFailure("fact_extraction", "ai_budget", E.aiBudget);
    }
    aiCalls++;
  };
  const checkTime = (stage: ResearchStage) => {
    if (signal.aborted) {
      throw new StageFailure(stage, "timeout", E.timeout);
    }
  };
  const flushUsage = async () => {
    if (usage.length) await store.recordUsage(jobId, usage.splice(0));
    await store.updateJob(jobId, { usage: totals });
  };

  await store.updateJob(jobId, {
    status: "running",
    startedAt: job.startedAt ?? now().toISOString(),
    heartbeatAt: now().toISOString(),
    errorDetails: null,
  });
  await store.updateProject(project.id, { status: "running" });

  let queriesRun = 0;
  let queriesFailed = 0;
  let claims: ClaimRow[] = [];
  let claimsRejected = 0;
  let conflicts: Array<{ key: string; description: string }> = [];
  let insufficient: string[] = [];
  let profileGenerated = false;
  let retrievalStats: { retrieved: number; notPermitted: number; failed: number } | null = null;
  let profileUrlState: SourceCategoryStatus["state"] | null = null;

  const runQueries = async (queries: PlannedQuery[], input: ResearchInput, stage: ResearchStage) => {
    const results: SearchResult[] = [];
    const errors: ProviderError[] = [];
    for (const { query: q, category } of queries) {
      if (signal.aborted) break;
      // A category can become unavailable mid-run (e.g. its only provider rejected the key).
      if (router!.available(category).length === 0) continue;
      try {
        const { hits, provider } = await router!.search(q, category, { count: limits.resultsPerQuery, signal });
        queriesRun++;
        track({ kind: "search_query", provider: provider.id, units: 1 });
        results.push(
          ...normalizeHits(hits, provider.id, q, { fullName: input.fullName, company: input.company, profileUrl: input.profileUrl }, now()).map((r) =>
            category === "news" && r.sourceType === "web_page" ? { ...r, sourceType: "news" as const } : r,
          ),
        );
      } catch (err) {
        queriesFailed++;
        const pe = err instanceof ProviderError ? err : new ProviderError("Search", "unknown", "Search failed");
        errors.push(pe);
        await log(stage, "warning", E.queryFailed(pe.toUserMessage(E.provider)));
      }
    }
    return { results, errors };
  };
  const webQueries = (queries: string[]): PlannedQuery[] => queries.map((query) => ({ query, category: "web" }));

  const toNewSource = (r: SearchResult): NewSource => ({
    url: r.url,
    normalizedUrl: r.normalizedUrl,
    title: r.title || null,
    domain: r.domain,
    sourceType: r.sourceType,
    author: null,
    publishedAt: r.publishedAt,
    accessedAt: r.retrievedAt,
    excerpt: r.snippet || null,
    contentText: null,
    retrievalStatus: "snippet_only",
    retrievalNote: null,
    relevance: "unassessed",
    provider: r.provider,
    metadata: { queries: "queries" in r ? (r as { queries: string[] }).queries : [r.query] },
  });

  try {
    // ---------------------------------------------------------------- Stage 1
    const parsed = researchInputSchema.safeParse(project.input);
    if (!parsed.success) throw new StageFailure("input_validation", "invalid_input", E.invalidInput);
    const input = parsed.data;
    if (!router) {
      unavailableProviders.add("web_search");
      throw new StageFailure(
        "input_validation",
        "search_not_configured",
        E.searchNotConfigured,
      );
    }
    if (!deps.model) unavailableProviders.add("ai_analysis");
    if (!deps.content) unavailableProviders.add("page_retrieval");
    await log("input_validation", "done", E.inputValidated);

    const plan = buildQueryPlan(input, limits.maxQueriesPerJob, undefined, { news: router.supports("news") });

    // ---------------------------------------------------------------- Stage 2
    if (!identity.selected) {
      // A public profile URL supplied by the user is retrieved directly (when the site
      // permits it) and shown to identity resolution as the strongest identifying source.
      let profileSource: SourceRecord | null = null;
      if (input.profileUrl) {
        const normalized = normalizeUrl(input.profileUrl);
        const domain = domainOf(input.profileUrl);
        if (!deps.content || limits.maxPageFetchesPerJob === 0) {
          profileUrlState = "not_configured";
        } else if (!normalized || isAutomatedRetrievalRestricted(domain)) {
          profileUrlState = "not_available";
          await log("identity_discovery", "warning", E.profileRestricted);
        } else {
          await log("identity_discovery", "running", E.checkingProfile);
          try {
            const page = await deps.content.retrieve(input.profileUrl, signal);
            track({ kind: "page_fetch", provider: "web", units: 1 });
            const title = (page.title ?? domain).slice(0, 500);
            const [stored] = await store.upsertSources(project.id, jobId, [
              {
                url: input.profileUrl,
                normalizedUrl: normalized,
                title,
                domain,
                sourceType: classifySource(input.profileUrl, title, { fullName: input.fullName, company: input.company, profileUrl: input.profileUrl }),
                author: page.author,
                publishedAt: page.publishedAt,
                accessedAt: now().toISOString(),
                excerpt: page.description,
                contentText: page.text,
                retrievalStatus: "retrieved",
                retrievalNote: page.truncated ? E.longPage : null,
                relevance: "unassessed",
                provider: "user_profile_url",
                metadata: { suppliedByUser: true },
              },
            ]);
            if (stored && stored.retrievalStatus !== "retrieved") {
              // The URL was already saved from search results (snippet only): attach the retrieved page.
              const patch: Partial<NewSource> = { contentText: page.text, retrievalStatus: "retrieved", retrievalNote: null, accessedAt: now().toISOString() };
              await store.updateSource(stored.id, patch);
              Object.assign(stored, patch);
            }
            profileSource = stored ?? null;
            profileUrlState = "searched";
            await log("identity_discovery", "done", E.profileRetrieved);
          } catch (err) {
            const pe = err instanceof ProviderError ? err : new ProviderError("Page retrieval", "unknown", "Retrieval failed");
            profileUrlState = pe.code === "not_permitted" || pe.code === "blocked" ? "not_available" : "failed";
            await log("identity_discovery", "warning", E.profileFailed(pe.toUserMessage(E.provider)));
          }
        }
      }

      await log("identity_discovery", "running", E.identitySearches(plan.identity.length));
      const { results, errors } = await runQueries(webQueries(plan.identity), input, "identity_discovery");
      if (results.length === 0 && errors.length > 0 && !profileSource) {
        throw new StageFailure("identity_discovery", errors[0].code, E.searchFailed(errors[0].toUserMessage(E.provider)));
      }
      if (results.length === 0 && !profileSource) {
        await flushUsage();
        throw new StageFailure("identity_discovery", "no_results", E.noResults);
      }
      const { results: deduped } = dedupeResults(results, limits.maxSourcesPerJob);
      const searched = await store.upsertSources(project.id, jobId, deduped.map(toNewSource));
      const stored = profileSource ? [profileSource, ...searched.filter((s) => s.id !== profileSource.id)] : searched;
      checkTime("identity_discovery");
      let outcome;
      if (deps.model) {
        consumeAiBudget();
        try {
          outcome = await resolveIdentityWithAI(deps.model, input, stored, signal);
          if (outcome.usage) track(outcome.usage);
        } catch (err) {
          const pe = err instanceof ProviderError ? err : null;
          await log("identity_discovery", "warning", E.aiIdentityFailed(pe?.toUserMessage(E.provider) ?? E.unknownError));
          outcome = resolveIdentityHeuristically(input, stored);
        }
      } else {
        outcome = resolveIdentityHeuristically(input, stored);
      }
      identity = outcome.state;
      await flushUsage();
      if (identity.decision === "no_credible_match" || !identity.candidates?.length) {
        await store.updateJob(jobId, { identity });
        throw new StageFailure("identity_discovery", "no_match", E.noMatch);
      }
      if (!outcome.autoSelected) {
        await log("identity_discovery", "warning", E.ambiguous);
        await store.updateJob(jobId, { status: "needs_input", identity });
        await store.updateProject(project.id, { status: "needs_input" });
        return store.getJob(jobId);
      }
      await log("identity_discovery", "done", E.matched(identity.selected!.label));
    } else {
      await log("identity_discovery", "skipped", E.usingConfirmed(identity.selected.label));
    }

    const selected = identity.selected!;
    const identityDescription = `${selected.label}. ${selected.description}${selected.additionalContext ? ` User note: ${selected.additionalContext}` : ""}`;
    const personId = await store.ensurePerson(project, {
      displayName: input.fullName,
      description: selected.description,
      identityStatus: selected.confirmedBy === "user" ? "user_confirmed" : "matched_by_identifiers",
      attributes: { company: input.company ?? null, role: input.role ?? null, location: input.location ?? null, profileUrl: input.profileUrl ?? null, identityLabel: selected.label },
    });
    await store.updateProject(project.id, { personId });

    // Mark identity sources: chosen candidate's sources are about the person, other candidates' are not.
    const chosen = new Set(selected.sourceNormalizedUrls);
    const otherCandidateUrls = new Set(
      (identity.candidates ?? []).filter((c) => c.id !== selected.candidateId).flatMap((c) => c.sources.map((s) => s.normalizedUrl)),
    );

    // ---------------------------------------------------------------- Stage 3
    checkTime("source_search");
    // When the user gave no company/role, anchor queries on the confirmed candidate's first attribute.
    const selectedCandidate = identity.candidates?.find((c) => c.id === selected.candidateId);
    const disambiguator = input.company || input.role ? undefined : selectedCandidate?.attributes[0];
    const sourceQueries = buildQueryPlan(input, limits.maxQueriesPerJob, disambiguator, { news: router.supports("news") }).sources;
    const webPlanned = sourceQueries.filter((q) => q.category === "web");
    const newsPlanned = sourceQueries.filter((q) => q.category === "news");
    await log("source_search", "running", E.searchingWeb(webPlanned.length));
    const web = await runQueries(webPlanned, input, "source_search");
    let news = { results: [] as SearchResult[], errors: [] as ProviderError[] };
    if (newsPlanned.length) {
      await log("source_search", "running", E.searchingNews(newsPlanned.length));
      news = await runQueries(newsPlanned, input, "source_search");
    }
    const sourceResults = [...web.results, ...news.results];
    const searchErrors = [...web.errors, ...news.errors];
    // A whole category that could not be searched makes the report partial, with the reason stated.
    if (newsPlanned.length && news.results.length === 0 && news.errors.length >= newsPlanned.length) warnings.push(E.categoryFailed(E.categoryNames.news));
    if (searchErrors.length > 0 && sourceResults.length === 0) {
      warnings.push(E.targetedFailed);
    }
    await log("source_search", searchErrors.length ? "warning" : "done", E.searchSummary(sourceResults.length, queriesRun, queriesFailed));
    await flushUsage();

    // ---------------------------------------------------------------- Stage 5 (dedupe before fetch)
    checkTime("deduplication");
    const existing = await store.listSources(project.id);
    const fresh = sourceResults.filter((r) => !otherCandidateUrls.has(r.normalizedUrl));
    const pinned = new Set([...chosen]);
    const { results: deduped, stats } = dedupeResults(
      [...fresh],
      Math.max(0, limits.maxSourcesPerJob - existing.filter((s) => !otherCandidateUrls.has(s.normalizedUrl)).length),
      pinned,
    );
    await store.upsertSources(project.id, jobId, deduped.map(toNewSource));
    await log(
      "deduplication",
      "done",
      E.dedupe(stats.exactDuplicates, stats.nearDuplicates, stats.trimmed),
    );

    let sources = await store.listSources(project.id);
    for (const s of sources) {
      if (otherCandidateUrls.has(s.normalizedUrl) && s.relevance !== "unrelated") {
        await store.updateSource(s.id, { relevance: "unrelated" });
        s.relevance = "unrelated";
      } else if (chosen.has(s.normalizedUrl) && s.relevance === "unassessed") {
        const relevance = identity.method === "ai" ? "about_person" : "possibly_about_person";
        await store.updateSource(s.id, { relevance });
        s.relevance = relevance;
      }
    }

    // ---------------------------------------------------------------- Stage 4
    checkTime("source_retrieval");
    const candidatesForFetch = sources
      .filter((s) => s.relevance !== "unrelated" && s.retrievalStatus !== "retrieved")
      .sort((a, b) => Number(chosen.has(b.normalizedUrl)) - Number(chosen.has(a.normalizedUrl)));
    if (!deps.content || limits.maxPageFetchesPerJob === 0) {
      await log("source_retrieval", "skipped", E.retrievalDisabled);
    } else {
      let retrieved = 0;
      let notPermitted = 0;
      let failed = 0;
      let attempted = 0;
      for (const s of candidatesForFetch) {
        if (signal.aborted) break;
        if (isAutomatedRetrievalRestricted(s.domain)) {
          const note = E.platformRestricted;
          await store.updateSource(s.id, { retrievalStatus: "not_permitted", retrievalNote: note });
          Object.assign(s, { retrievalStatus: "not_permitted", retrievalNote: note });
          notPermitted++;
          continue;
        }
        if (attempted >= limits.maxPageFetchesPerJob) break;
        attempted++;
        try {
          const page = await deps.content.retrieve(s.url, signal);
          track({ kind: "page_fetch", provider: "web", units: 1 });
          const patch: Partial<NewSource> = {
            contentText: page.text,
            retrievalStatus: "retrieved",
            retrievalNote: page.truncated ? E.longPage : null,
            title: s.title ?? page.title,
            author: page.author,
            publishedAt: s.publishedAt ?? page.publishedAt,
            accessedAt: now().toISOString(),
          };
          await store.updateSource(s.id, patch);
          Object.assign(s, patch);
          retrieved++;
        } catch (err) {
          const pe = err instanceof ProviderError ? err : new ProviderError("Page retrieval", "unknown", "Retrieval failed");
          const status = pe.code === "not_permitted" ? "not_permitted" : pe.code === "blocked" ? "blocked" : "failed";
          await store.updateSource(s.id, { retrievalStatus: status, retrievalNote: pe.message.slice(0, 300) });
          Object.assign(s, { retrievalStatus: status, retrievalNote: pe.message });
          if (status === "failed") failed++;
          else notPermitted++;
        }
      }
      retrievalStats = { retrieved, notPermitted, failed };
      await log(
        "source_retrieval",
        failed > 0 ? "warning" : "done",
        E.retrievalSummary(retrieved, notPermitted, failed),
      );
    }
    await flushUsage();
    sources = await store.listSources(project.id);

    // Syndicated copies (the same article republished on several sites) are found by
    // comparing retrieved text, and grouped so they count as one source.
    const CRED_RANK = { primary: 0, established_publication: 1, secondary: 2, user_generated: 3, unknown: 4 } as const;
    const copies = detectSyndication(
      sources
        .filter((s) => s.relevance !== "unrelated")
        .map((s) => ({
          id: s.id,
          domain: s.domain,
          publishedAt: s.publishedAt,
          credibilityRank: CRED_RANK[sourceCredibility(s.sourceType, s.domain)],
          text: s.contentText ?? "",
        })),
    );
    for (const c of copies) {
      const s = sources.find((x) => x.id === c.sourceId)!;
      const metadata = { ...s.metadata, syndicationOf: c.originalId, independenceKey: c.independenceKey };
      await store.updateSource(s.id, { metadata });
      s.metadata = metadata;
    }
    if (copies.length) await log("deduplication", "done", E.syndicated(copies.length));

    // ---------------------------------------------------------------- Stages 6–8
    checkTime("fact_extraction");
    const analysable = sources.filter((s) => s.relevance !== "unrelated" && (s.contentText || s.excerpt));
    if (!deps.model) {
      for (const stage of ["fact_extraction", "claim_association", "conflict_analysis", "interest_analysis", "profile_generation"] as const) {
        await log(stage, "skipped", E.aiNotConfigured);
      }
      warnings.push(E.aiNotConfiguredWarning);
    } else if (analysable.length === 0) {
      await log("fact_extraction", "warning", E.noAnalysable);
      warnings.push(E.noAnalysableWarning);
    } else {
      await log("fact_extraction", "running", E.extracting(analysable.length));
      consumeAiBudget();
      try {
        await store.deleteJobClaims(jobId);
        const { result, usage: u } = await extractClaims(deps.model, input, identityDescription, analysable, signal, E, language);
        track(u);
        for (const [sourceId, relevance] of result.relevance) {
          await store.updateSource(sourceId, { relevance });
        }
        claimsRejected = result.rejected.length;
        conflicts = result.conflicts;
        await log("fact_extraction", "done", E.proposed(result.claims.length + result.rejected.length));
        claims = await store.insertClaims(project.id, jobId, personId, result.claims);
        await log(
          "claim_association",
          claimsRejected ? "warning" : "done",
          E.linked(claims.length, claimsRejected),
        );
        await log(
          "conflict_analysis",
          conflicts.length ? "warning" : "done",
          conflicts.length ? E.conflictsFound(conflicts.length) : E.noConflicts,
        );
      } catch (err) {
        const pe = err instanceof ProviderError ? err : null;
        if (err instanceof StageFailure) throw err;
        await log("fact_extraction", "error", E.extractionFailed(pe?.toUserMessage(E.provider) ?? E.unknownError));
        warnings.push(E.extractionFailedWarning);
      }
      await flushUsage();

      // ---------------------------------------------------------------- Stages 9–10
      if (claims.length > 0 || analysable.length > 0) {
        await log("interest_analysis", "running", E.analysing);
        await log("profile_generation", "running", E.generating);
        try {
          consumeAiBudget();
          const sourcesForProfile = (await store.listSources(project.id)).filter((s) => s.relevance !== "unrelated");
          const generated = await generateProfileSections(deps.model, {
            input,
            identityDescription,
            claims,
            sources: sourcesForProfile,
            sections: GENERATED_SECTION_TYPES,
            signal,
            messages: E,
            language,
          });
          track(generated.usage);
          insufficient = generated.insufficient;
          await store.saveSections(project.id, personId, jobId, [
            ...generated.sections,
            { sectionType: "visual_style", content: { ...visualStyleUnavailable(E) }, modelMetadata: {} },
          ]);
          profileGenerated = true;
          await log("interest_analysis", "done", E.topicsDone);
          await log("profile_generation", insufficient.length ? "warning" : "done", insufficient.length ? E.generatedInsufficient(insufficient.map((x) => messages.sectionLabels[x as keyof typeof messages.sectionLabels] ?? x).join(", ")) : E.generated);
        } catch (err) {
          if (err instanceof StageFailure) throw err;
          const pe = err instanceof ProviderError ? err : null;
          await log("profile_generation", "error", E.generationFailed(pe?.toUserMessage(E.provider) ?? E.unknownError));
          warnings.push(E.generationFailedWarning);
        }
        await flushUsage();
      }
    }

    // ---------------------------------------------------------------- Stage 12
    checkTime("save_and_quality");
    await log("meeting_brief", "skipped", E.briefsOnRequest);
    const finalSources = await store.listSources(project.id);
    if (!profileUrlState && input.profileUrl) {
      // Resumed after the identity choice: derive what happened from the saved sources.
      profileUrlState = finalSources.some((s) => s.provider === "user_profile_url")
        ? "searched"
        : isAutomatedRetrievalRestricted(domainOf(input.profileUrl))
          ? "not_available"
          : !deps.content
            ? "not_configured"
            : "failed";
    }
    const quality = buildQualityReport({
      sources: finalSources,
      claims,
      claimsRejected,
      conflicts,
      insufficientSections: insufficient,
      queriesRun,
      queriesFailed,
      warnings,
      unavailableProviders: [...unavailableProviders],
      profileGenerated,
      messages: E,
      sectionLabels: messages.sectionLabels,
      providers: router.report(),
      categories: categoryStatuses({
        router,
        sources: finalSources,
        contentConfigured: Boolean(deps.content) && limits.maxPageFetchesPerJob > 0,
        retrieval: retrievalStats,
        profileUrlState,
      }),
    });
    const status = profileGenerated && warnings.length === 0 ? "completed" : "partial";
    await log("save_and_quality", status === "completed" ? "done" : "warning", status === "completed" ? E.complete : E.partial);
    await store.updateJob(jobId, { status, qualityReport: quality, completedAt: now().toISOString(), identity });
    await store.updateProject(project.id, { status, lastResearchedAt: now().toISOString() });
    await store.audit("research.completed", { projectId: project.id, jobId, status });
    return store.getJob(jobId);
  } catch (err) {
    const failure: JobError =
      err instanceof StageFailure
        ? { stage: err.stage, code: err.code, message: err.message }
        : signal.aborted
          ? { stage: progress.at(-1)?.stage ?? "input_validation", code: "timeout", message: E.timeout }
          : { stage: progress.at(-1)?.stage ?? "input_validation", code: "unexpected", message: E.unexpected };
    try {
      await flushUsage();
    } catch {
      // usage accounting must not mask the original failure
    }
    const hasSources = (await store.listSources(project.id).catch(() => [] as SourceRecord[])).length > 0;
    const status = hasSources && failure.stage !== "identity_discovery" ? "partial" : "failed";
    progress.push({ stage: failure.stage, status: "error", message: failure.message, at: now().toISOString() });
    await store.updateJob(jobId, { status, errorDetails: failure, progress, completedAt: now().toISOString(), identity });
    await store.updateProject(project.id, { status, lastResearchedAt: hasSources ? now().toISOString() : project.lastResearchedAt });
    await store.audit("research.failed", { projectId: project.id, jobId, code: failure.code });
    return store.getJob(jobId);
  }
}

/**
 * Per-category coverage for the report: what was really searched, how many
 * results came back, and which categories have no integration in this version.
 */
export function categoryStatuses(args: {
  router: SearchRouter;
  sources: SourceRecord[];
  contentConfigured: boolean;
  retrieval: { retrieved: number; notPermitted: number; failed: number } | null;
  profileUrlState: SourceCategoryStatus["state"] | null;
}): SourceCategoryStatus[] {
  const reports = args.router.report();
  const searchState = (category: "web" | "news"): SourceCategoryStatus => {
    if (!args.router.supports(category)) return { category, state: "not_configured" };
    const rows = reports.filter((r) => r.category === category);
    const queries = rows.reduce((n, r) => n + r.queries, 0);
    if (queries === 0) return { category, state: "skipped" };
    const succeeded = rows.reduce((n, r) => n + r.succeeded, 0);
    const failed = rows.reduce((n, r) => n + r.failed, 0);
    return {
      category,
      state: succeeded === 0 ? "failed" : failed > 0 ? "partial" : "searched",
      count: rows.reduce((n, r) => n + r.results, 0),
      providers: [...new Set(rows.filter((r) => r.succeeded > 0).map((r) => r.label))],
    };
  };
  const relevant = args.sources.filter((s) => s.relevance !== "unrelated");
  const found = (...types: SourceRecord["sourceType"][]) => relevant.filter((s) => types.includes(s.sourceType)).length;
  const r = args.retrieval;
  return [
    searchState("web"),
    searchState("news"),
    { category: "profile", state: args.profileUrlState ?? "skipped" },
    !args.contentConfigured
      ? { category: "page_retrieval", state: "not_configured" }
      : !r
        ? { category: "page_retrieval", state: "skipped" }
        : { category: "page_retrieval", state: r.retrieved === 0 && r.failed > 0 ? "failed" : r.failed > 0 ? "partial" : "searched", count: r.retrieved },
    // No dedicated integrations yet: pages of these kinds are included only when web search returns them.
    { category: "video", state: "not_available", count: found("video") },
    { category: "podcast", state: "not_available", count: found("podcast") },
    { category: "social", state: "not_available", count: found("social_media", "professional_network") },
    { category: "forums", state: "not_available" },
  ];
}

export type { ProjectRow };
