@AGENTS.md

# Persona Intelligence — engineering guide

Public-source research and meeting-preparation SaaS. Next.js 16 App Router, Supabase, OpenAI and a pluggable search provider. Read `README.md` for setup. This file covers how to work on the code.

## Commands (run from `persona-intelligence/`)

- `npm run dev`: dev server
- `npm run lint && npm run typecheck && npm test && npm run build`: run all four before committing
- `npm run test:db`: RLS tests against a throwaway Postgres (needs local PG binaries or Docker)

## Layout

```
src/app/(public)        landing, /demo (fictional), /privacy
src/app/(auth)          sign-in/up, password recovery + server actions
src/app/(app)           authenticated: dashboard, research/[id] (+ meeting, briefs, report, history), settings
src/app/api             route handlers (all mutations; every one calls guard())
src/proxy.ts            session refresh + redirect (convenience only; not a security boundary)
src/lib/config.ts       ALL env access, limits, mode detection; getPublicConfig() is the only client-safe shape
src/lib/research/       pipeline.ts (12 stages), identity, extraction, evidence (verification + confidence),
                        profile (section post-validation), meeting, quality, dedupe, queries, classify, store (interface)
src/lib/providers/      search (brave, tavily), content (safe-fetch, robots, extract), analysis (openai)
src/lib/ai/             schemas.ts (Zod for every AI output), prompts/ (all prompt text)
src/lib/db/             supabase-store (ResearchStore impl), queries (page loaders), mappers, account export
src/lib/security/       ip.ts (pure SSRF checks; browser-safe), ssrf.ts (DNS), url.ts, rate-limit.ts
src/lib/export/         citations + markdown exports
src/lib/demo/           FICTIONAL data only (.example domains); always labelled
src/lib/billing/        catalog (central prices), paddle (client + signature), webhook (pure logic), repository,
                        entitlements, preview (server-built free preview), gate, offers
src/i18n/               config, messages/{en,he}.ts (typed, parity-tested), legal/, server.ts, provider.tsx, format.ts
src/components/         ui primitives, profile/evidence renderers (shared by live + demo), research, brief
supabase/migrations     schema, RLS, functions;  supabase/tests/auth-stub.sql for local tests
tests/unit, tests/integration (MemoryStore + fakes), tests/db (pg, RLS)
```

## Architecture rules

- The pipeline depends only on interfaces: `ResearchStore`, `SearchProvider`, `ContentProvider` and `StructuredModel`. Add providers behind them. Never call vendor APIs from components or routes.
- Models refer to sources and claims only by IDs (`S1`, `C3`). URLs always come from stored search results. Post-validation in `extraction.ts`, `profile.ts` and `meeting.ts` drops unknown IDs, unverifiable excerpts and unverified quotes.
- Confidence labels are computed in `evidence.ts` from the evidence, never by the model. Never add numeric confidence or personality scores.
- Stored section content uses DB UUIDs. User edits live in `profile_sections.user_override` and notes in `user_notes`. Regeneration must never overwrite either (`save_profile_sections()` carries overrides forward).
- Jobs run via `scheduleResearchJob()` (`after()`) with the user's JWT. No service-role key in the request path.
- Never fabricate research. Missing providers produce explicit `not_configured` states. Demo data stays in `src/lib/demo` and is labelled “Fictional demo”.

## Security requirements

- Every API route starts with `guard()` (auth, same-origin check for mutations, rate limit). Validate input with the Zod schemas in `lib/validation/schemas.ts` and validate IDs with `uuidSchema`.
- Ownership is enforced by RLS. A foreign ID simply returns no row, so respond 404. Every new table needs `user_id`, RLS enabled, and an owner policy whose WITH CHECK confirms project ownership. Add a test in `tests/db/rls.test.ts`.
- Fetch external URLs only through `safeFetch` (connect-time IP check, manual redirects, size cap) via `WebContentProvider` (robots.txt, platform restrictions, no bypassing logins/paywalls/CAPTCHAs).
- Treat retrieved content and user context as untrusted: pass it through `renderSources` / `sanitizeUntrusted` and keep `BASE_RULES` in every prompt.
- Secrets are read only in `lib/config.ts`. Never use `NEXT_PUBLIC_` for secrets, and never read `process.env` in `"use client"` files (a test enforces this).
- Never export plain objects or constants from `"use client"` modules for server use: they become client references. Put shared constants in `lib/`.
- No sensitive-trait inference, facial recognition, appearance-based judgements, or manipulation advice. Keep these rules in the prompts and the UI copy.

## Localization and billing rules

- No hardcoded UI strings: add keys to BOTH `en.ts` and `he.ts` (a test enforces parity). Server: `getI18n()`; client: `useI18n()`. Use logical CSS and `<bdi>`/`dir="auto"` for names, URLs and mixed text. Never translate names, source titles or quotes.
- Premium report content is gated on the server: pages call `requireUnlockedReport()`, APIs call `requireFullReport()`, and locked pages render only `buildPreview()` output. Never pass full report data to a client component for a locked report.
- Entitlements change only through the signed Paddle webhook or the unlock RPCs (service role, idempotent SQL functions). Never grant access from the browser or simulate payment success.

## Conventions

- TypeScript strict. Server-only modules import `"server-only"`.
- Next 16 specifics: async `params`/`searchParams`, `proxy.ts` (not middleware), `PageProps<"/route">` helpers. Pages that read auth go through `getAuth()`, which calls `connection()` so they always render dynamically.
- Styling: tokens in `globals.css` (`bg-paper`, `text-ink`, `text-muted`, `border-line`, `accent`, confidence tones). Use logical properties (`ps-`, `me-`, `start-`) for future RTL. Keep the restrained editorial style: no gradients and no decorative badges.
- Tests must not call live paid APIs. Use `tests/helpers/fakes.ts` and `MemoryStore`.

## Next steps

Visual style analysis (with consent and permission checks, no biometrics), native PDF export, a durable job queue, a Redis rate limiter, team workspaces.
