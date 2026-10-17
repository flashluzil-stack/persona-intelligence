import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodError } from "zod";
import { getApiAuth } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/config";
import type { RateLimiter } from "@/lib/security/rate-limit";
import { fieldErrors } from "@/lib/validation/schemas";

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function validationError(error: ZodError) {
  return jsonError(400, "Please correct the highlighted fields.", { fields: fieldErrors(error) });
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

type ApiAuth = NonNullable<Awaited<ReturnType<typeof getApiAuth>>>;

/** Common guard: config present, same origin for mutations, authenticated, rate limited. */
export async function guard(
  request: NextRequest,
  opts: { limiter?: RateLimiter; mutation?: boolean } = {},
): Promise<{ auth: ApiAuth } | { response: NextResponse }> {
  if (!getSupabaseConfig()) return { response: jsonError(503, "Authentication is not configured on this server.") };
  if (opts.mutation !== false && request.method !== "GET" && !isSameOrigin(request)) {
    return { response: jsonError(403, "Cross-origin request rejected.") };
  }
  const auth = await getApiAuth();
  if (!auth) return { response: jsonError(401, "Please sign in.") };
  if (opts.limiter) {
    const rl = opts.limiter.check(`${auth.user.id}:${request.nextUrl.pathname.split("/").slice(0, 3).join("/")}`);
    if (!rl.allowed) {
      return {
        response: NextResponse.json(
          { error: "Too many requests. Please wait a moment." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
        ),
      };
    }
  }
  return { auth };
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
