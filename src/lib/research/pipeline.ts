import { GENERATED_SECTION_TYPES } from "@/lib/ai/schemas";
import type { ResearchLimits } from "@/lib/config";
import type { StructuredModel } from "@/lib/providers/analysis/openai";
import { normalizeHits } from "@/lib/providers/search";
import { researchInputSchema, type ResearchInput } from "@/lib/validation/schemas";
import { isAutomatedRetrievalRestricted } from "./classify";
import { dedupeResults } from "./dedupe";
import { extractClaims } from "./extraction";
import { resolveIdentityHeuristically, resolveIdentityWithAI } from "./identity";
import { generateProfileSections, VISUAL_STYLE_UNAVAILABLE } from "./profile";
import { buildQueryPlan } from "./queries";
import { buildQualityReport } from "./quality";
import type { ClaimRow, IdentityState, JobError, JobRow, NewSource, ProjectRow, ResearchStore, UsageTotals } from "./store";
import {
  ProviderError,
  type ContentProvider,
  type ResearchStage,
  type SearchProvider,
  type SearchResult,
  type SourceRecord,
  type StageLogEntry,
  type UsageRecord,
} from "./types";

export interface PipelineDeps {
  store: ResearchStore;
  search: SearchProvider | null;
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
      throw new StageFailure("fact_extraction", "ai_budget", "The AI call budget for this research job was reached.");
    }
    aiCalls++;
  };
  const checkTime = (stage: ResearchStage) => {
    if (signal.aborted) {
      throw new StageFailure(stage, "timeout", "The research job exceeded its time budget. Results saved so far are preserved.");
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

  const runQueries = async (queries: string[], input: ResearchInput, stage: ResearchStage) => {
    const results: SearchResult[] = [];
    const errors: ProviderError[] = [];
    for (const q of queries) {
      if (signal.aborted) break;
      try {
        const hits = await deps.search!.search(q, { count: limits.resultsPerQuery, signal });
        queriesRun++;
        track({ kind: "search_query", provider: deps.search!.id, units: 1 });
        results.push(
          ...normalizeHits(hits, deps.search!.id, q, { fullName: input.fullName, company: input.company, profileUrl: input.profileUrl }, now()),
        );
      } catch (err) {
        queriesFailed++;
        const pe = err instanceof ProviderError ? err : new ProviderError(deps.search!.label, "unknown", "Search failed");
        errors.push(pe);
        await log(stage, "warning", `A search query failed: ${pe.toUserMessage()}`);
        // Credentials/quota errors will not recover within this job.
        if (pe.code === "unauthorized" || pe.code === "quota_exceeded") break;
      }
    }
    return { results, errors };
  };

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
    if (!parsed.success) throw new StageFailure("input_validation", "invalid_input", "The saved research input is invalid. Start a new research project.");
    const input = parsed.data;
    if (!deps.search) {
      unavailableProviders.add("web_search");
      throw new StageFailure(
        "input_validation",
        "search_not_configured",
        "No live web search provider is configured, so no research was performed. Configure BRAVE_SEARCH_API_KEY or TAVILY_API_KEY.",
      );
    }
    if (!deps.model) unavailableProviders.add("ai_analysis");
    if (!deps.content) unavailableProviders.add("page_retrieval");
    await log("input_validation", "done", "Input validated.");

    const plan = buildQueryPlan(input, limits.maxQueriesPerJob);

    // ---------------------------------------------------------------- Stage 2
    if (!identity.selected) {
      await log("identity_discovery", "running", `Running ${plan.identity.length} identity search${plan.identity.length === 1 ? "" : "es"}.`);
      const { results, errors } = await runQueries(plan.identity, input, "identity_discovery");
      if (results.length === 0 && errors.length > 0) {
        throw new StageFailure("identity_discovery", errors[0].code, `Search failed: ${errors[0].toUserMessage()}`);
      }
      if (results.length === 0) {
        await flushUsage();
        throw new StageFailure("identity_discovery", "no_results", "No public search results were found for this name and context. Try adding a company, role, or known profile URL.");
      }
      const { results: deduped } = dedupeResults(results, limits.maxSourcesPerJob);
      const stored = await store.upsertSources(project.id, jobId, deduped.map(toNewSource));
      checkTime("identity_discovery");
      let outcome;
      if (deps.model) {
        consumeAiBudget();
        try {
          outcome = await resolveIdentityWithAI(deps.model, input, stored, signal);
          if (outcome.usage) track(outcome.usage);
        } catch (err) {
          const pe = err instanceof ProviderError ? err : null;
          await log("identity_discovery", "warning", `AI identity matching failed (${pe?.toUserMessage() ?? "unknown error"}); falling back to keyword grouping.`);
          outcome = resolveIdentityHeuristically(input, stored);
        }
      } else {
        outcome = resolveIdentityHeuristically(input, stored);
      }
      identity = outcome.state;
      await flushUsage();
      if (identity.decision === "no_credible_match" || !identity.candidates?.length) {
        await store.updateJob(jobId, { identity });
        throw new StageFailure("identity_discovery", "no_match", "None of the search results could be attributed to the person you described. Add more identifying context and try again.");
      }
      if (!outcome.autoSelected) {
        await log("identity_discovery", "warning", "Identity is ambiguous or unconfirmed. Waiting for you to choose the intended person.");
        await store.updateJob(jobId, { status: "needs_input", identity });
        await store.updateProject(project.id, { status: "needs_input" });
        return store.getJob(jobId);
      }
      await log("identity_discovery", "done", `Matched to "${identity.selected!.label}" using your identifiers.`);
    } else {
      await log("identity_discovery", "skipped", `Using confirmed identity: ${identity.selected.label}.`);
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
    const sourceQueries = buildQueryPlan(input, limits.maxQueriesPerJob, disambiguator).sources;
    await log("source_search", "running", `Running ${sourceQueries.length} targeted search${sourceQueries.length === 1 ? "" : "es"}.`);
    const { results: sourceResults, errors: searchErrors } = await runQueries(sourceQueries, input, "source_search");
    if (searchErrors.length > 0 && sourceResults.length === 0) {
      warnings.push("Targeted source searches failed; the profile relies on identity search results only.");
    }
    await log("source_search", searchErrors.length ? "warning" : "done", `${sourceResults.length} results from ${queriesRun} queries (${queriesFailed} failed).`);
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
      `Removed ${stats.exactDuplicates} duplicate URLs and ${stats.nearDuplicates} near-identical pages; ${stats.trimmed} extra results skipped by the source limit.`,
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
      await log("source_retrieval", "skipped", "Page retrieval is disabled; analysis uses search snippets only.");
    } else {
      let retrieved = 0;
      let notPermitted = 0;
      let failed = 0;
      let attempted = 0;
      for (const s of candidatesForFetch) {
        if (signal.aborted) break;
        if (isAutomatedRetrievalRestricted(s.domain)) {
          const note = "This platform restricts automated access; only the search snippet is used.";
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
            retrievalNote: page.truncated ? "Long page; only the beginning was analysed." : null,
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
      await log(
        "source_retrieval",
        failed > 0 ? "warning" : "done",
        `Retrieved ${retrieved} page${retrieved === 1 ? "" : "s"}; ${notPermitted} not permitted or blocked; ${failed} failed. Other sources use search snippets.`,
      );
    }
    await flushUsage();
    sources = await store.listSources(project.id);

    // ---------------------------------------------------------------- Stages 6–8
    checkTime("fact_extraction");
    const analysable = sources.filter((s) => s.relevance !== "unrelated" && (s.contentText || s.excerpt));
    if (!deps.model) {
      for (const stage of ["fact_extraction", "claim_association", "conflict_analysis", "interest_analysis", "profile_generation"] as const) {
        await log(stage, "skipped", "AI analysis is not configured (OPENAI_API_KEY). Sources were collected but no claims were extracted.");
      }
      warnings.push("AI analysis is not configured; no claims or profile were generated.");
    } else if (analysable.length === 0) {
      await log("fact_extraction", "warning", "No sources about this person were available to analyse.");
      warnings.push("No analysable sources about this person were found.");
    } else {
      await log("fact_extraction", "running", `Extracting claims from ${analysable.length} sources.`);
      consumeAiBudget();
      try {
        await store.deleteJobClaims(jobId);
        const { result, usage: u } = await extractClaims(deps.model, input, identityDescription, analysable, signal);
        track(u);
        for (const [sourceId, relevance] of result.relevance) {
          await store.updateSource(sourceId, { relevance });
        }
        claimsRejected = result.rejected.length;
        conflicts = result.conflicts;
        await log("fact_extraction", "done", `Proposed ${result.claims.length + result.rejected.length} claims.`);
        claims = await store.insertClaims(project.id, jobId, personId, result.claims);
        await log(
          "claim_association",
          claimsRejected ? "warning" : "done",
          `Linked ${claims.length} claims to verbatim source excerpts; rejected ${claimsRejected} that could not be verified.`,
        );
        await log(
          "conflict_analysis",
          conflicts.length ? "warning" : "done",
          conflicts.length ? `Found ${conflicts.length} conflicting set${conflicts.length === 1 ? "" : "s"} of claims.` : "No conflicting claims detected.",
        );
      } catch (err) {
        const pe = err instanceof ProviderError ? err : null;
        if (err instanceof StageFailure) throw err;
        await log("fact_extraction", "error", `Fact extraction failed: ${pe?.toUserMessage() ?? "unexpected error"}. Sources are preserved.`);
        warnings.push("Fact extraction failed; sources are saved but no claims were produced.");
      }
      await flushUsage();

      // ---------------------------------------------------------------- Stages 9–10
      if (claims.length > 0 || analysable.length > 0) {
        await log("interest_analysis", "running", "Analysing recurring topics, communication and values.");
        await log("profile_generation", "running", "Generating evidence-linked profile sections.");
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
          });
          track(generated.usage);
          insufficient = generated.insufficient;
          await store.saveSections(project.id, personId, jobId, [
            ...generated.sections,
            { sectionType: "visual_style", content: { ...VISUAL_STYLE_UNAVAILABLE }, modelMetadata: {} },
          ]);
          profileGenerated = true;
          await log("interest_analysis", "done", "Topic analysis complete.");
          await log("profile_generation", insufficient.length ? "warning" : "done", insufficient.length ? `Profile generated; insufficient evidence for: ${insufficient.join(", ")}.` : "Profile generated.");
        } catch (err) {
          if (err instanceof StageFailure) throw err;
          const pe = err instanceof ProviderError ? err : null;
          await log("profile_generation", "error", `Profile generation failed: ${pe?.toUserMessage() ?? "unexpected error"}. Claims and sources are preserved.`);
          warnings.push("Profile generation failed; claims and sources are saved.");
        }
        await flushUsage();
      }
    }

    // ---------------------------------------------------------------- Stage 12
    checkTime("save_and_quality");
    await log("meeting_brief", "skipped", "Meeting briefs are generated on request from the Meeting preparation page.");
    const finalSources = await store.listSources(project.id);
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
    });
    const status = profileGenerated && warnings.length === 0 ? "completed" : "partial";
    await log("save_and_quality", status === "completed" ? "done" : "warning", status === "completed" ? "Research complete." : "Research finished with partial results.");
    await store.updateJob(jobId, { status, qualityReport: quality, completedAt: now().toISOString(), identity });
    await store.updateProject(project.id, { status, lastResearchedAt: now().toISOString() });
    await store.audit("research.completed", { projectId: project.id, jobId, status });
    return store.getJob(jobId);
  } catch (err) {
    const failure: JobError =
      err instanceof StageFailure
        ? { stage: err.stage, code: err.code, message: err.message }
        : signal.aborted
          ? { stage: progress.at(-1)?.stage ?? "input_validation", code: "timeout", message: "The research job exceeded its time budget. Saved results are preserved." }
          : { stage: progress.at(-1)?.stage ?? "input_validation", code: "unexpected", message: "An unexpected error stopped the research job. Saved results are preserved." };
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

export type { ProjectRow };
