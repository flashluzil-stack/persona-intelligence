# Persona Intelligence

Public-source research and meeting intelligence. Enter a person's name and any identifiers you know. Persona Intelligence searches public sources through a configured provider and confirms which person you mean. It extracts claims and checks each one against the source text word for word, then labels the evidence and builds a structured profile. From that profile it generates a meeting brief for your objective: interview, investor meeting, partnership, sales, negotiation, networking and more.

> “Understand who you are meeting, discover what they have publicly shared, identify relevant professional interests, and prepare for the conversation with evidence rather than assumptions.”

This is a decision-support tool. It does **not** read minds, diagnose personality, infer sensitive traits, use facial recognition, or score trustworthiness.

## Status: what works today

| Area | Status |
| --- | --- |
| Landing page, fictional demo profile and brief, privacy/limitations page | ✅ Implemented |
| Sign-up, sign-in, sign-out, password recovery (Supabase Auth) | ✅ Implemented, verified end to end |
| Dashboard: research form, projects, saved profiles, briefs, job status, search history, incomplete warnings | ✅ |
| 12-stage research pipeline with live search (Brave or Tavily) | ✅ Implemented. Tested with mocked providers; **no live paid API was called during development** |
| Identity disambiguation (candidates with evidence; user must choose when ambiguous) | ✅ |
| Permitted page retrieval (robots.txt, platform restrictions, SSRF protection, size limits) | ✅ |
| Claim extraction, verbatim-excerpt verification, deterministic confidence labels, conflicts, dates | ✅ |
| Profile sections (overview, background, interests, communication, values, relationships, recent, open questions) | ✅ |
| Research quality report (counts and limitations, no single score) | ✅ |
| Meeting briefs (10 objectives, source-linked, saved, exportable) | ✅ |
| Private notes, section edits that survive regeneration, regenerate a section, refresh research, version history | ✅ |
| Exports: Markdown (profile, report, bibliography, brief) and print-friendly pages (browser “Save as PDF”) | ✅ |
| Settings: account, provider status, usage, retention, data export, account deletion | ✅ |
| RLS, per-user quotas, rate limiting, audit events, retention | ✅ |
| Visual style analysis of photos | ⏳ Not implemented: the section clearly reports “not available” |
| Native PDF generation, team workspaces, billing, Hebrew/RTL locale | ⏳ Planned (the layout already uses logical CSS properties for RTL) |

## Technology

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS v4 with design tokens · Lucide icons · Supabase (Postgres, Auth, RLS) · OpenAI Chat Completions with JSON-schema structured output · Zod v4 · Vitest · `pg` for database tests.

The UI components are small, accessible, shadcn-style primitives written in the repo (`src/components/ui`), with no runtime UI library.

> This app lives in the `persona-intelligence/` folder of a repository that also contains an unrelated Vite project. Run every command from `persona-intelligence/`.

## Installation

```bash
cd persona-intelligence
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

Without any configuration, the landing page, fictional demo (`/demo`) and privacy page work. Without a search provider the app runs in **demo mode**: research cannot start, and nothing is ever simulated.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit + integration tests (mocked providers, no network) |
| `npm run test:db` | Row-level-security tests on a throwaway PostgreSQL 16 (local binaries or Docker) |

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. All of them are read **on the server at runtime**.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | For accounts | Supabase project URL and anon/publishable key (`NEXT_PUBLIC_SUPABASE_*` also accepted, but those are frozen at build time) |
| `APP_URL` | Recommended | Public URL used in email links |
| `SEARCH_PROVIDER` | Optional | `brave`, `tavily` or `auto` |
| `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY` | For research | Live web search |
| `OPENAI_API_KEY` | For analysis | Claims, profiles, briefs |
| `OPENAI_MODEL` | Optional | Default `gpt-5-mini`. Any model that supports JSON-schema structured output |
| `RESEARCH_*`, `BRIEF_DAILY_QUOTA` | Optional | Cost and safety limits |

No service-role key is needed. Research jobs run with the signed-in user's own token, so RLS applies to every query.

## Supabase configuration

1. Create a Supabase project.
2. Apply the migration in `supabase/migrations/`, either with the [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase link` then `supabase db push`) or by pasting the SQL into the SQL editor.
3. In **Authentication → URL configuration**, set the Site URL to `APP_URL` and add `APP_URL/auth/callback` to the redirect allow-list (used for email confirmation and password recovery).
4. Copy the project URL and anon/publishable key into `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
5. Optional: schedule `select public.purge_expired_research();` daily with `pg_cron` to enforce retention for inactive users. (Signed-in users' retention is also applied whenever they open the dashboard.)

### Database design

Tables: `user_settings`, `research_projects`, `persons`, `person_identifiers`, `research_jobs`, `sources`, `claims`, `claim_evidence`, `profile_sections` (versioned), `meeting_briefs`, `user_notes`, `usage_events`, `audit_events`.

- Every table has `user_id`, and RLS allows access only to `user_id = auth.uid()`. Child rows must also reference a project the caller owns.
- `usage_events` and `audit_events` are append-only for users. `anon` has no access.
- `save_profile_sections()` versions sections atomically and carries user edits forward. `delete_my_account()` deletes the auth user and everything cascades. `apply_my_retention()` / `purge_expired_research()` enforce retention.
- Public-source data (`sources`, `claims`, `profile_sections.structured_content`) is kept separate from user content (`user_notes`, `profile_sections.user_override`).

## Search & AI providers

- **Search:** set `BRAVE_SEARCH_API_KEY` (Brave Search API) or `TAVILY_API_KEY`. Results are normalized to a common shape (URL, title, domain, snippet, publication date, retrieval date, source type, provider). To add a provider, implement `SearchProvider` in `src/lib/providers/search/` and register it in `createSearchProvider()`.
- **AI:** set `OPENAI_API_KEY`. Outputs are validated with Zod. On invalid output the client retries once, sending the validation error back to the model. Prompts live in `src/lib/ai/prompts/`.
- **Page retrieval** needs no key. It honours robots.txt, never fetches LinkedIn, X, Facebook, Instagram, TikTok, Glassdoor or Crunchbase, refuses `noai` pages, and never bypasses logins, paywalls or CAPTCHAs.

## How research works

1. Validate input → 2. identity search and candidate grouping (pause for the user's choice when ambiguous or when only a name was given) → 3. targeted searches (interviews, podcasts, publications, projects, talks, news) → 4. deduplicate (URL normalization and near-duplicate detection) → 5. retrieve permitted pages → 6. extract claims → 7. verify each excerpt verbatim against stored source text (unverifiable claims are discarded) → 8. conflict and date analysis (a “current” claim older than two years loses its current status) → 9–10. interest analysis and profile generation (sources and claims are referenced by ID, so the model cannot invent URLs) → 11. meeting brief on request → 12. save and build the quality report.

Jobs run after the HTTP response (`after()`), save progress after every stage, and can be resumed if the server is recycled. Statuses: queued, running, needs input, completed, partially completed, failed.

## Testing

- `npm test` runs 143 tests covering input validation (missing name, invalid or unsafe URLs, length limits), SSRF (private/reserved IPv4/IPv6, metadata hosts, DNS rebinding, numeric hosts, redirects), source handling (robots.txt, permissions, extraction, dedup), provider failures, timeouts and retries, invalid AI output, prompt injection, missing citations, unsupported claims, conflicts, insufficient evidence, ambiguous identity, partial results, no results, objective-specific briefs, exports with and without notes, secret-exposure checks and rate limits.
- `npm run test:db` runs 15 RLS tests: cross-user isolation, attaching rows to another user's project, private notes, anon access, append-only audit, section versioning that preserves user edits, cascade deletes, retention, and account deletion.
- During development the production build was also exercised end to end against a local stack: real Supabase Auth (GoTrue) + PostgREST + PostgreSQL with this migration, plus mock search and AI endpoints. 35 browser checks passed, covering sign-up, research, ambiguous identity, editing, regeneration, notes, briefs, exports, cross-user 404s, data export, account deletion, and mobile layout.

## Deployment

**Step-by-step phone-friendly guide: [DEPLOY.md](DEPLOY.md)** (Vercel + Supabase via the Vercel Marketplace; database tables created automatically at build time when `PERSONA_MIGRATE_ON_BUILD=true`).

Any Node.js 20+ host that supports Next.js 16 works (Vercel, Fly, Render, a container).

1. Set the environment variables in the host, apply the migration to Supabase, and configure the auth URLs.
2. `npm ci && npm run build && npm start`.
3. On serverless platforms, research runs inside `after()` and is bounded by the platform's function duration. Keep `RESEARCH_JOB_TIMEOUT_MS` below it. For heavy use, move `scheduleResearchJob()` (`src/lib/research/runner.ts`) to a durable queue (Supabase Queues, Inngest, a worker).
4. The in-memory API rate limiter is per instance. For multiple instances, back `RateLimiter` with Redis. Daily quotas and concurrency limits are already enforced in the database.

## Known limitations

- Coverage is limited to the search provider. Social networks are only seen through search snippets.
- Exact-match excerpt verification can reject valid claims when a page's text differs from its snippet. Rejections are counted in the quality report.
- Visual style analysis, native PDF export, team workspaces, billing and the Hebrew/RTL locale are not implemented yet.
- Robots.txt is checked for the original host, not for hosts reached through redirects.
- Nothing here is legal advice. Operators are responsible for compliance (GDPR, CCPA and similar) and for the terms of the providers they configure.
