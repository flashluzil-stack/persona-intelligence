import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { getPublicConfig, getResearchLimits, isOperatorEmail } from "@/lib/config";
import { safeFetch } from "@/lib/providers/content/safe-fetch";
import { WebContentProvider } from "@/lib/providers/content/web-content-provider";
import { createSearchProviders } from "@/lib/providers/search";
import { runRetrievalCheck, runSearchChecks } from "@/lib/research/diagnostics";
import { RateLimiter } from "@/lib/security/rate-limit";

const limiter = new RateLimiter(3, 10 * 60_000);

/**
 * Operator-only live check of the configured providers (real API calls with
 * neutral queries). Reports configuration, success, result counts, retries
 * and error codes. Never returns keys or raw provider responses.
 */
export async function POST(request: NextRequest) {
  const g = await guard(request, { limiter });
  if ("response" in g) return g.response;
  if (!isOperatorEmail(g.auth.user.email)) return jsonError(404, g.t.errors.notFound);
  const cfg = getPublicConfig();
  const limits = getResearchLimits();
  const [search, retrieval] = await Promise.all([
    runSearchChecks(createSearchProviders()),
    runRetrievalCheck(cfg.pageRetrievalEnabled ? new WebContentProvider(safeFetch, { maxBytes: limits.maxPageBytes, maxChars: limits.maxContentChars }) : null),
  ]);
  await g.auth.supabase.from("audit_events").insert({ user_id: g.auth.user.id, event_type: "diagnostics.providers", metadata: { checks: search.length } });
  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      searchConfigured: cfg.searchProviders,
      search,
      retrieval,
      ai: { configured: cfg.analysisConfigured, model: cfg.analysisModel },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
