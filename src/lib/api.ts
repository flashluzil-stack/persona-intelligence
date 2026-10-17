import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodError } from "zod";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { getI18n } from "@/i18n/server";
import { getApiAuth } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/config";
import type { RateLimiter } from "@/lib/security/rate-limit";
import { fieldErrors } from "@/lib/validation/schemas";

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function validationError(error: ZodError, t: Messages) {
  return jsonError(400, t.errors.fixFields, { fields: fieldErrors(error, t) });
}

/** Rejects cross-origin mutation requests (defense in depth on top of SameSite cookies). */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers / server-side callers
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

type ApiAuth = NonNullable<Awaited<ReturnType<typeof getApiAuth>>>;

export type Guarded = { auth: ApiAuth; t: Messages; locale: Locale };

/** Common guard: config present, same origin for mutations, authenticated, rate limited. Errors are localized. */
export async function guard(
  request: NextRequest,
  opts: { limiter?: RateLimiter; mutation?: boolean } = {},
): Promise<Guarded | { response: NextResponse }> {
  const { t, locale } = await getI18n();
  if (!getSupabaseConfig()) return { response: jsonError(503, t.errors.authNotConfigured) };
  if (opts.mutation !== false && request.method !== "GET" && !isSameOrigin(request)) {
    return { response: jsonError(403, t.errors.crossOrigin) };
  }
  const auth = await getApiAuth();
  if (!auth) return { response: jsonError(401, t.errors.signIn) };
  if (opts.limiter) {
    const rl = opts.limiter.check(`${auth.user.id}:${request.nextUrl.pathname.split("/").slice(0, 3).join("/")}`);
    if (!rl.allowed) {
      return {
        response: NextResponse.json({ error: t.errors.tooManyRequests }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }),
      };
    }
  }
  return { auth, t, locale };
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    const text = await request.text();
    if (text.length > 100_000) return null;
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

/**
 * Server-side paywall gate for premium report endpoints. Returns a 402
 * response when the caller has not unlocked the report, otherwise null.
 */
export async function requireFullReport(g: Guarded, projectId: string): Promise<NextResponse | null> {
  const { getReportAccess } = await import("@/lib/billing/entitlements");
  const access = await getReportAccess(g.auth.supabase, projectId);
  return access.full ? null : jsonError(402, g.t.errors.locked, { code: "locked" });
}
