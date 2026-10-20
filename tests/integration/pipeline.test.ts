import { describe, expect, it } from "vitest";
import { runResearchJob, type PipelineDeps } from "@/lib/research/pipeline";
import { ProviderError, type SearchCategory, type SearchHit, type SearchOptions, type SearchProvider } from "@/lib/research/types";
import type { ResearchInput } from "@/lib/validation/schemas";
import { FakeContent, FakeModel, FakeSearch, testLimits } from "../helpers/fakes";
import { MemoryStore } from "../helpers/memory-store";
import { PAGES, refFor, SEARCH_HITS, URLS } from "../helpers/scenario";

const input: ResearchInput = { fullName: "Maya Brenner", company: "Northwind Analytics", purpose: "business_partnership" };

function identityResponder(decision: "single_clear_match" | "ambiguous" = "single_clear_match") {
  return (req: { user: string }) => ({
    candidates: [
      {
        id: "P1",
        label: "Maya Brenner, Chief Data Officer at Northwind Analytics",
        description: "Data executive at Northwind Analytics.",
        distinguishing_attributes: ["Northwind Analytics", "Chief Data Officer"],
        match_reasons: ["Employer matches the company you supplied."],
        source_ids: [refFor(req.user, "mayabrenner"), refFor(req.user, "northwindanalytics"), refFor(req.user, "reuters")],
        matches_user_identifiers: "strong",
      },
      {
        id: "P2",
        label: "Maya Brenner, pastry chef in Lisbon",
        description: "Pastry chef at Sweet Crumbs bakery.",
        distinguishing_attributes: ["Sweet Crumbs", "Lisbon"],
        match_reasons: ["Same name, different profession."],
        source_ids: [refFor(req.user, "sweetcrumbs")],
        matches_user_identifiers: "none",
      },
    ],
    decision,
    selected_candidate_id: decision === "single_clear_match" ? "P1" : null,
    reasoning: "Two distinct people share the name.",
  });
}

const extractionResponder = (req: { user: string }) => {
  const company = refFor(req.user, "northwindanalytics");
  const news = refFor(req.user, "reuters");
  const personal = refFor(req.user, "mayabrenner");
  const blog = refFor(req.user, "datablog");
  return {
    source_assessments: [
      { source_id: company, relevance: "about_person", reason: "Company bio" },
      { source_id: news, relevance: "about_person", reason: "News report" },
      { source_id: personal, relevance: "about_person", reason: "Own website" },
      { source_id: blog, relevance: "about_person", reason: "Interview" },
    ],
    claims: [
      {
        claim_text: "Maya Brenner is Chief Data Officer at Northwind Analytics.",
        category: "current_role",
        evidence_type: "documented_fact",
        temporal_status: "current",
        as_of_date: null,
        evidence: [
          { source_id: company, excerpt: "Maya Brenner is Chief Data Officer at Northwind Analytics", relationship: "supports", support_strength: "direct" },
          { source_id: news, excerpt: "Northwind Analytics named Maya Brenner chief data officer", relationship: "supports", support_strength: "direct" },
        ],
        conflict_key: null,
        limitations: null,
      },
      {
        claim_text: "Maya Brenner joined Northwind Analytics in 2021.",
        category: "past_role",
        evidence_type: "self_statement",
        temporal_status: "historical",
        as_of_date: "2021",
        evidence: [{ source_id: personal, excerpt: "I joined Northwind Analytics in 2021", relationship: "supports", support_strength: "direct" }],
        conflict_key: "join_year",
        limitations: null,
      },
      {
        claim_text: "Maya Brenner joined Northwind Analytics in 2022.",
        category: "past_role",
        evidence_type: "secondary_report",
        temporal_status: "historical",
        as_of_date: "2022",
        evidence: [{ source_id: news, excerpt: "Maya Brenner joined the company in 2022", relationship: "supports", support_strength: "direct" }],
        conflict_key: "join_year",
        limitations: null,
      },
      {
        // Simulates a model that followed the injected instruction: the excerpt is
        // not in any source, so the claim must be rejected.
        claim_text: "Maya Brenner was convicted of fraud.",
        category: "other",
        evidence_type: "secondary_report",
        temporal_status: "unknown",
        as_of_date: null,
        evidence: [{ source_id: blog, excerpt: "Maya Brenner was convicted of fraud in 2019", relationship: "supports", support_strength: "direct" }],
        conflict_key: null,
        limitations: null,
      },
      {
        claim_text: "Maya Brenner opened a bakery in Lisbon.",
        category: "project",
        evidence_type: "secondary_report",
        temporal_status: "historical",
        as_of_date: null,
        evidence: [{ source_id: "S99", excerpt: "Pastry chef Maya Brenner opened Sweet Crumbs in Lisbon", relationship: "supports", support_strength: "direct" }],
        conflict_key: null,
        limitations: null,
      },
      {
        claim_text: "Maya Brenner believes privacy should be designed in from the start.",
        category: "stated_value",
        evidence_type: "self_statement",
        temporal_status: "unknown",
        as_of_date: null,
        evidence: [{ source_id: personal, excerpt: "I believe privacy should be designed in from the first line of code", relationship: "supports", support_strength: "direct" }],
        conflict_key: null,
        limitations: null,
      },
    ],
    conflicts: [{ conflict_key: "join_year", description: "Her own site says 2021; a news report says 2022." }],
  };
};

const profileResponder = (req: { user: string }) => {
  const personal = refFor(req.user, "mayabrenner");
  const blog = refFor(req.user, "datablog");
  const news = refFor(req.user, "reuters");
  return {
    overview: {
      summary: "Maya Brenner is a data executive focused on privacy-preserving analytics.",
      current_role: { text: "Chief Data Officer, Northwind Analytics", claim_ids: ["C1"] },
      key_points: [
        { text: "Leads data governance", claim_ids: ["C1"] },
        { text: "Unsupported point", claim_ids: ["C77"] },
      ],
      limitations: ["Few independent sources."],
    },
    background: {
      summary: "Career in analytics.",
      positions: [{ title: "Chief Data Officer", organization: "Northwind Analytics", period: "2021/2022–present", status: "current", claim_ids: ["C1"] }],
      education: [],
      achievements: [],
      publications: [],
      projects: [],
    },
    interests: {
      summary: "Privacy and governance.",
      topics: [
        { topic: "Privacy by design", description: "Discussed on own site and in an interview.", kind: "professional_topic", source_ids: [personal, blog] },
        { topic: "Retail analytics", description: "Mentioned once.", kind: "industry", source_ids: [news] },
      ],
      limitations: [],
    },
    communication: {
      summary: "Direct, first-person writing.",
      observations: [{ dimension: "formality", observation: "Uses first-person, plain language.", source_ids: [personal] }],
      limitations: [],
    },
    values: {
      summary: "Privacy by design.",
      items: [
        { idea: "Privacy built in from the start", kind: "direct_quote", quote: "privacy should be designed in from the first line of code", source_id: personal },
        { idea: "Governance as product", kind: "direct_quote", quote: "Governance is the most important thing in the universe", source_id: blog },
      ],
    },
    relationships: { summary: "Employer relationship.", items: [{ counterpart: "Northwind Analytics", relationship: "employer", description: "Current employer", claim_ids: ["C1"] }] },
    recent: { summary: "Recent appointment.", items: [{ summary: "Named CDO", source_id: news, reported_event_date: null, why_it_may_matter: "Decision-maker for data partnerships." }] },
    open_questions: {
      missing_information: ["Education is not documented."],
      conflicting_information: ["Start year 2021 vs 2022."],
      needs_verification: [],
      questions_to_ask: ["What are your data partnership priorities?"],
      insufficient_evidence_areas: [],
    },
  };
};

function makeDeps(store: MemoryStore, overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    store,
    search: new FakeSearch(() => SEARCH_HITS),
    content: new FakeContent(PAGES),
    model: new FakeModel({
      identity_resolution: identityResponder(),
      claim_extraction: extractionResponder,
      profile_sections: profileResponder,
    }),
    limits: testLimits,
    ...overrides,
  };
}

/** Mocked provider with web and news categories (deterministic; no live API). */
class CategorySearch implements SearchProvider {
  readonly categories: readonly SearchCategory[] = ["web", "news"];
  calls: Array<{ query: string; category: SearchCategory }> = [];
  constructor(
    readonly id: string,
    private readonly reply: (category: SearchCategory) => SearchHit[] | ProviderError,
  ) {}
  get label() {
    return `Provider ${this.id}`;
  }
  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const category = opts.category ?? "web";
    this.calls.push({ query, category });
    const r = this.reply(category);
    if (r instanceof ProviderError) throw r;
    return r;
  }
}

const NEWS_HIT: SearchHit = {
  url: "https://newswire.example/2026/northwind-data-governance",
  title: "Northwind Analytics expands data governance team",
  snippet: "Chief Data Officer Maya Brenner said the team will double this year.",
  publishedAt: "2026-09-01T08:00:00Z",
};

describe("research pipeline", () => {
  it("runs end to end and produces an evidence-linked profile", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    const result = await runResearchJob(job.id, makeDeps(store));

    expect(result?.status).toBe("completed");
    expect(store.projects.get(project.id)?.status).toBe("completed");
    expect(result?.identity.selected?.confirmedBy).toBe("automatic");

    // Sources keep their original URLs; duplicates are merged.
    const sources = await store.listSources(project.id);
    const urls = sources.map((s) => s.normalizedUrl);
    expect(new Set(urls).size).toBe(urls.length);
    expect(sources.filter((s) => s.normalizedUrl.includes("reuters.com"))).toHaveLength(1);
    expect(sources.find((s) => s.url === URLS.company)).toBeDefined();

    // The other person's source is unrelated; LinkedIn is snippet-only and never fetched.
    expect(sources.find((s) => s.url === URLS.otherPerson)?.relevance).toBe("unrelated");
    expect(sources.find((s) => s.url === URLS.linkedin)?.retrievalStatus).toBe("not_permitted");
    const fetched = (makeDeps(store).content as FakeContent).calls;
    expect(fetched).not.toContain(URLS.linkedin);

    // Claims: verified ones stored; fabricated/unrelated ones rejected.
    const claims = [...store.claims.values()];
    expect(claims.map((c) => c.claimText)).not.toContain("Maya Brenner was convicted of fraud.");
    expect(claims.map((c) => c.claimText)).not.toContain("Maya Brenner opened a bakery in Lisbon.");
    expect(result?.qualityReport?.claimsRejected).toBe(2);

    const role = claims.find((c) => c.category === "current_role")!;
    expect(role.confidenceLabel).toBe("high");
    expect(role.verificationStatus).toBe("corroborated");
    expect(role.temporalStatus).toBe("current");
    expect(role.evidence).toHaveLength(2);
    for (const e of role.evidence) expect(store.sources.get(e.sourceId)).toBeDefined();

    // Conflicts are kept on both sides and labelled.
    const joinClaims = claims.filter((c) => c.conflictGroup === "join_year");
    expect(joinClaims).toHaveLength(2);
    expect(joinClaims.every((c) => c.verificationStatus === "conflicting")).toBe(true);
    expect(result?.qualityReport?.conflicts).toHaveLength(1);

    // Profile sections reference stored ids and enforce evidence rules.
    const sections = Object.fromEntries((await store.listCurrentSections(project.id)).map((s) => [s.sectionType, s.content]));
    const overview = sections.overview as { key_points: Array<{ claim_ids: string[] }>; current_role: { claim_ids: string[] } };
    expect(overview.key_points).toHaveLength(1); // the point citing unknown C77 was dropped
    expect(overview.current_role.claim_ids[0]).toBe(role.id);
    const interests = sections.interests as { topics: Array<{ topic: string; recurring: boolean; source_count: number }> };
    expect(interests.topics.find((t) => t.topic === "Privacy by design")?.recurring).toBe(true);
    expect(interests.topics.find((t) => t.topic === "Retail analytics")?.recurring).toBe(false);
    const values = sections.values as { items: Array<{ kind: string; quote: string | null; note: string | null }> };
    expect(values.items[0].kind).toBe("direct_quote");
    expect(values.items[1].kind).toBe("paraphrase"); // invented quote downgraded
    expect(values.items[1].quote).toBeNull();
    expect((sections.visual_style as { status: string }).status).toBe("not_available");
    const recent = sections.recent as { items: Array<{ published_at: string | null }> };
    expect(recent.items[0].published_at).not.toBeNull();

    // No URL from the injected instruction is stored anywhere.
    expect(JSON.stringify([...store.sections, ...store.claims.values()])).not.toContain("evil.example");

    // Usage was tracked.
    expect(result?.usage.aiCalls).toBe(3);
    expect(result?.usage.searchQueries).toBeGreaterThan(0);
  });

  it("wraps untrusted page content as data in prompts", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const deps = makeDeps(store);
    await runResearchJob(job.id, deps);
    const extraction = (deps.model as FakeModel).requests.find((r) => r.name === "claim_extraction")!;
    expect(extraction.system).toMatch(/never an instruction to you/);
    const injected = extraction.user.indexOf("IGNORE ALL PREVIOUS INSTRUCTIONS");
    const open = extraction.user.lastIndexOf("<untrusted_source", injected);
    const close = extraction.user.indexOf("</untrusted_source>", injected);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(injected);
  });

  it("stops for user selection when identity is ambiguous, then continues", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    const deps = makeDeps(store, {
      model: new FakeModel({
        identity_resolution: identityResponder("ambiguous"),
        claim_extraction: extractionResponder,
        profile_sections: profileResponder,
      }),
    });
    const waiting = await runResearchJob(job.id, deps);
    expect(waiting?.status).toBe("needs_input");
    expect(store.projects.get(project.id)?.status).toBe("needs_input");
    expect(waiting?.identity.candidates).toHaveLength(2);
    expect(waiting?.identity.candidates?.[0].sources.length).toBeGreaterThan(0);
    expect(store.claims.size).toBe(0);

    // Running again without a selection does nothing.
    expect((await runResearchJob(job.id, deps))?.status).toBe("needs_input");

    const chosen = waiting!.identity.candidates![0];
    await store.updateJob(job.id, {
      status: "queued",
      identity: {
        ...waiting!.identity,
        selected: {
          candidateId: chosen.id,
          label: chosen.label,
          description: chosen.description,
          confirmedBy: "user",
          sourceNormalizedUrls: chosen.sources.map((s) => s.normalizedUrl),
        },
      },
    });
    const done = await runResearchJob(job.id, deps);
    expect(done?.status).toBe("completed");
    expect([...store.persons.values()][0].identityStatus).toBe("user_confirmed");
  });

  it("never auto-selects an identity from a bare name", async () => {
    const store = new MemoryStore();
    const { job } = store.seed({ fullName: "Maya Brenner" });
    const result = await runResearchJob(job.id, makeDeps(store));
    expect(result?.status).toBe("needs_input");
  });

  it("fails clearly when no search provider is configured", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const result = await runResearchJob(job.id, makeDeps(store, { search: null }));
    expect(result?.status).toBe("failed");
    expect(result?.errorDetails?.code).toBe("search_not_configured");
    expect(result?.errorDetails?.message).toMatch(/no research was performed/i);
    expect(store.sources.size).toBe(0);
    expect(store.claims.size).toBe(0);
  });

  it("reports provider failures with understandable messages", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const search = new FakeSearch(() => new ProviderError("Fake Search", "unauthorized", "HTTP 401"));
    const result = await runResearchJob(job.id, makeDeps(store, { search }));
    expect(result?.status).toBe("failed");
    expect(result?.errorDetails?.message).toContain("rejected the configured credentials");
    expect(search.calls).toHaveLength(1); // stops after a credential error
  });

  it("handles no results", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const result = await runResearchJob(job.id, makeDeps(store, { search: new FakeSearch(() => []) }));
    expect(result?.status).toBe("failed");
    expect(result?.errorDetails?.code).toBe("no_results");
    expect(result?.errorDetails?.message).toMatch(/No public search results/);
  });

  it("preserves partial results when AI output is invalid", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    const model = new FakeModel({
      identity_resolution: identityResponder(),
      claim_extraction: () => ({ claims: "not an array" }),
      profile_sections: profileResponder,
    });
    const result = await runResearchJob(job.id, makeDeps(store, { model }));
    expect(result?.status).toBe("partial");
    expect((await store.listSources(project.id)).length).toBeGreaterThan(0);
    expect(result?.progress.some((p) => p.stage === "fact_extraction" && p.status === "error")).toBe(true);
    expect(result?.qualityReport?.limitations.join(" ")).toMatch(/Fact extraction failed/);
  });

  it("collects sources without AI and asks the user to confirm identity", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    const deps = makeDeps(store, { model: null });
    const waiting = await runResearchJob(job.id, deps);
    expect(waiting?.status).toBe("needs_input");
    expect(waiting?.identity.method).toBe("heuristic");
    const chosen = waiting!.identity.candidates![0];
    expect(chosen.matchStrength).not.toBe("strong");
    await store.updateJob(job.id, {
      status: "queued",
      identity: { ...waiting!.identity, selected: { candidateId: chosen.id, label: chosen.label, description: chosen.description, confirmedBy: "user", sourceNormalizedUrls: chosen.sources.map((s) => s.normalizedUrl) } },
    });
    const result = await runResearchJob(job.id, deps);
    expect(result?.status).toBe("partial");
    expect(store.claims.size).toBe(0);
    expect(store.sections).toHaveLength(0);
    expect(result?.qualityReport?.unavailableProviders).toContain("ai_analysis");
    expect((await store.listSources(project.id)).length).toBeGreaterThan(0);
  });

  it("marks inaccessible pages and continues", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    const content = new FakeContent({
      ...PAGES,
      [URLS.company]: new ProviderError("Page retrieval", "not_permitted", "The page requires login or denies access."),
      [URLS.news]: new ProviderError("Page retrieval", "timeout", "Page did not respond in time", true),
    });
    const result = await runResearchJob(job.id, makeDeps(store, { content }));
    const sources = await store.listSources(project.id);
    expect(sources.find((s) => s.url === URLS.company)?.retrievalStatus).toBe("not_permitted");
    expect(sources.find((s) => s.url === URLS.news)?.retrievalStatus).toBe("failed");
    // Snippet evidence still verifies the role claim.
    expect(["completed", "partial"]).toContain(result?.status);
    expect(store.claims.size).toBeGreaterThan(0);
  });

  it("times out without losing saved sources", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    let calls = 0;
    const search = {
      id: "slow",
      label: "Slow",
      async search(_q: string, opts: { signal?: AbortSignal }) {
        calls++;
        if (calls === 1) return SEARCH_HITS;
        return new Promise<never>((_r, reject) =>
          opts.signal?.addEventListener("abort", () => reject(new ProviderError("Slow", "timeout", "timeout", true))),
        );
      },
    };
    const result = await runResearchJob(job.id, makeDeps(store, { search, limits: { ...testLimits, jobTimeoutMs: 150 } }));
    expect(["partial", "failed"]).toContain(result?.status);
    expect(result?.status).not.toBe("completed");
    expect((await store.listSources(project.id)).length).toBeGreaterThan(0);
  });

  it("is idempotent for finished jobs", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const deps = makeDeps(store);
    await runResearchJob(job.id, deps);
    const before = store.usage.length;
    const again = await runResearchJob(job.id, deps);
    expect(again?.status).toBe("completed");
    expect(store.usage.length).toBe(before);
  });

  it("respects the AI call budget", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const result = await runResearchJob(job.id, makeDeps(store, { limits: { ...testLimits, maxAiCallsPerJob: 1 } }));
    expect(result?.status).not.toBe("completed");
    expect(result?.usage.aiCalls).toBe(1);
  });

  it("searches news through a news-capable provider and reports coverage by category", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    const provider = new CategorySearch("multi", (c) => (c === "news" ? [NEWS_HIT] : SEARCH_HITS));
    const result = await runResearchJob(job.id, makeDeps(store, { search: provider }));
    expect(result?.status).toBe("completed");
    expect(provider.calls.some((c) => c.category === "news")).toBe(true);
    const news = (await store.listSources(project.id)).find((s) => s.url === NEWS_HIT.url);
    expect(news?.sourceType).toBe("news");
    const cats = Object.fromEntries((result?.qualityReport?.categories ?? []).map((c) => [c.category, c]));
    expect(cats.web).toMatchObject({ state: "searched" });
    expect(cats.news).toMatchObject({ state: "searched", count: 1, providers: ["Provider multi"] });
    expect(["searched", "partial"]).toContain(cats.page_retrieval.state);
    expect(cats.page_retrieval.count).toBeGreaterThan(0);
    expect(cats.video.state).toBe("not_available");
    expect(result?.qualityReport?.providers?.find((p) => p.category === "news")).toMatchObject({ queries: 1, succeeded: 1, results: 1 });
    expect(result?.progress.some((p) => p.message.startsWith("Collecting news and articles"))).toBe(true);
  });

  it("marks news as not configured when no provider supports it, without failing", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const result = await runResearchJob(job.id, makeDeps(store));
    expect(result?.status).toBe("completed");
    const news = result?.qualityReport?.categories?.find((c) => c.category === "news");
    expect(news?.state).toBe("not_configured");
  });

  it("returns a partial report, with the reason, when a whole category fails", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const provider = new CategorySearch("multi", (c) => (c === "news" ? new ProviderError("Provider multi", "rate_limited", "429", true) : SEARCH_HITS));
    const result = await runResearchJob(job.id, makeDeps(store, { search: provider }));
    expect(result?.status).toBe("partial");
    expect(result?.qualityReport?.limitations.some((l) => l.includes("News search could not be searched"))).toBe(true);
    expect(result?.qualityReport?.categories?.find((c) => c.category === "news")?.state).toBe("failed");
    expect(result?.qualityReport?.claimsExtracted).toBeGreaterThan(0);
  });

  it("fails over to a secondary provider when the primary rejects its key", async () => {
    const store = new MemoryStore();
    const { job } = store.seed(input);
    const primary = new CategorySearch("primary", () => new ProviderError("Provider primary", "unauthorized", "401"));
    const secondary = new CategorySearch("secondary", (c) => (c === "news" ? [NEWS_HIT] : SEARCH_HITS));
    const result = await runResearchJob(job.id, makeDeps(store, { search: [primary, secondary] }));
    expect(result?.status).toBe("completed");
    expect(primary.calls).toHaveLength(1); // disabled after the first rejection
    const reports = result?.qualityReport?.providers ?? [];
    expect(reports.find((r) => r.provider === "primary")).toMatchObject({ disabled: true, errors: { unauthorized: 1 } });
    expect(reports.filter((r) => r.provider === "secondary").reduce((n, r) => n + r.succeeded, 0)).toBeGreaterThan(0);
  });

  it("does not count a syndicated copy of an article as independent corroboration", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed(input);
    const copyUrl = "https://regional-business.example/2026/northwind-names-cdo";
    const copyHit: SearchHit = { url: copyUrl, title: "Northwind picks data chief", snippet: "Republished business news about Northwind Analytics.", publishedAt: null };
    const originalText = (PAGES[URLS.news] as { text: string }).text;
    const pages = { ...PAGES, [copyUrl]: { ...PAGES[URLS.news], finalUrl: copyUrl, text: `${originalText} ${originalText}` } };
    const model = new FakeModel({
      identity_resolution: identityResponder(),
      claim_extraction: (req: { user: string }) => {
        const news = refFor(req.user, "reuters");
        const copy = refFor(req.user, "regional-business");
        return {
          source_assessments: [
            { source_id: news, relevance: "about_person", reason: "News" },
            { source_id: copy, relevance: "about_person", reason: "News copy" },
          ],
          claims: [
            {
              claim_text: "Maya Brenner previously worked at Contoso Retail.",
              category: "past_role",
              evidence_type: "secondary_report",
              temporal_status: "historical",
              as_of_date: null,
              evidence: [
                { source_id: news, excerpt: "previously worked at Contoso Retail", relationship: "supports", support_strength: "direct" },
                { source_id: copy, excerpt: "previously worked at Contoso Retail", relationship: "supports", support_strength: "direct" },
              ],
              conflict_key: null,
              limitations: null,
            },
          ],
          conflicts: [],
        };
      },
      profile_sections: profileResponder,
    });
    const result = await runResearchJob(job.id, makeDeps(store, { search: new FakeSearch(() => [...SEARCH_HITS, copyHit]), content: new FakeContent(pages), model }));
    const copy = (await store.listSources(project.id)).find((s) => s.url === copyUrl)!;
    const original = (await store.listSources(project.id)).find((s) => s.url === URLS.news)!;
    expect(copy.metadata.syndicationOf).toBe(original.id);
    const claim = [...store.claims.values()].find((c) => c.claimText.includes("Contoso Retail"))!;
    expect(claim.evidence).toHaveLength(2); // both copies are still shown as evidence
    expect(claim.verificationStatus).toBe("single_source"); // ...but they are not independent
    expect(claim.confidenceLabel).not.toBe("high");
    expect(result?.progress.some((p) => p.message.includes("same article"))).toBe(true);
  });

  it("retrieves the profile URL the user supplied and shows it to identity resolution", async () => {
    const store = new MemoryStore();
    const { project, job } = store.seed({ ...input, profileUrl: URLS.personal });
    const deps = makeDeps(store);
    const result = await runResearchJob(job.id, deps);
    const prompts = (deps.model as FakeModel).requests.filter((r) => r.name === "identity_resolution").map((r) => r.user);
    expect(result?.status).toBe("completed");
    const profile = (await store.listSources(project.id)).find((s) => s.url === URLS.personal)!;
    expect(profile.retrievalStatus).toBe("retrieved");
    expect(profile.provider).toBe("user_profile_url");
    expect(prompts[0]).toContain("mayabrenner.example");
    expect(result?.qualityReport?.categories?.find((c) => c.category === "profile")?.state).toBe("searched");
    expect(result?.progress.some((p) => p.message === "Checking the public profile you provided.")).toBe(true);
  });

  it("never fetches a supplied profile on a platform that restricts automated access", async () => {
    const store = new MemoryStore();
    const { job } = store.seed({ ...input, profileUrl: URLS.linkedin });
    const deps = makeDeps(store);
    const result = await runResearchJob(job.id, deps);
    expect((deps.content as FakeContent).calls).not.toContain(URLS.linkedin);
    expect(result?.progress.some((p) => p.message.startsWith("The profile page you provided is on a platform"))).toBe(true);
    // No candidate is linked to the supplied profile's site, so the user is asked rather than guessed for.
    expect(result?.status).toBe("needs_input");
  });

  it("continues when the supplied profile cannot be retrieved", async () => {
    const store = new MemoryStore();
    const { job } = store.seed({ ...input, profileUrl: "https://gone.example/me" });
    const result = await runResearchJob(job.id, makeDeps(store));
    expect(result?.status).toBe("needs_input"); // research continues to the identity choice; nothing crashed
    expect(result?.progress.some((p) => p.message.startsWith("The profile page you provided could not be retrieved"))).toBe(true);
    expect(result?.identity.candidates?.length).toBeGreaterThan(0);
  });

  it("keeps the profile retrieval status after pausing for the identity choice", async () => {
    const store = new MemoryStore();
    const { job } = store.seed({ ...input, profileUrl: URLS.linkedin });
    const deps = makeDeps(store);
    const paused = await runResearchJob(job.id, deps);
    expect(paused?.status).toBe("needs_input");
    const candidate = paused!.identity.candidates![0];
    await store.updateJob(job.id, {
      status: "queued",
      identity: {
        ...paused!.identity,
        selected: { candidateId: candidate.id, label: candidate.label, description: candidate.description, confirmedBy: "user", sourceNormalizedUrls: candidate.sources.map((s) => s.normalizedUrl) },
      },
    });
    const result = await runResearchJob(job.id, deps);
    expect(result?.status).toBe("completed");
    expect(result?.qualityReport?.categories?.find((c) => c.category === "profile")?.state).toBe("not_available");
  });
});
