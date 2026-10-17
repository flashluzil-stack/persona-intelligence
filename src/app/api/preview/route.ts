import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getI18n } from "@/i18n/server";
import { clientIp, isSameOrigin, jsonError, readJson, validationError } from "@/lib/api";
import { getAccessConfig, getSupabaseConfig } from "@/lib/config";
import { rememberGuest } from "@/lib/guest";
import { startResearch } from "@/lib/research/start";
import { RateLimiter } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createServerSupabase } from "@/lib/supabase/server";
import { researchInputSchema } from "@/lib/validation/schemas";

export const maxDuration = 300;

// Per-IP limits on the public entry point (per instance; DB limits are authoritative).
const ipMinuteLimiter = new RateLimiter(3, 60_000);
const ipDayLimiter = new RateLimiter(10, 24 * 3600_000);

const previewSchema = researchInputSchema.pick({ fullName: true, company: true, role: true }).extend({
  captchaToken: z.string().max(4096).optional(),
});

/**
 * Public "free preview" entry point. Visitors without a session get a guest
 * (anonymous) Supabase session, so all data stays protected by RLS and can be
 * moved to a real account later. Limits: per IP, per guest/account, global.
 */
export async function POST(request: NextRequest) {
  const { t, locale } = await getI18n();
  if (!getSupabaseConfig()) return jsonError(503, t.errors.authNotConfigured);
  if (!isSameOrigin(request)) return jsonError(403, t.errors.crossOrigin);
  const ip = clientIp(request);
  if (!ipMinuteLimiter.check(ip).allowed || !ipDayLimiter.check(ip).allowed) return jsonError(429, t.errors.tooManyRequests);

  const body = await readJson(request);
  if (body === null) return jsonError(400, t.errors.invalidBody);
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error, t);

  const supabase = await createServerSupabase();
  let { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    const access = getAccessConfig();
    if (access.turnstileSecretKey && !(await verifyTurnstile(parsed.data.captchaToken, access.turnstileSecretKey, ip))) {
      return jsonError(400, t.preview.captchaRequired, { code: "captcha" });
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) return jsonError(403, t.preview.unavailable, { code: "guest_unavailable" });
    await rememberGuest(data.user.id);
    userData = { user: data.user };
  }
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (!userData.user || !accessToken) return jsonError(401, t.errors.signIn);

  const { captchaToken: _token, ...input } = parsed.data;
  const result = await startResearch({ supabase, user: userData.user, accessToken, t, locale }, { ...input, locale });
  if (!result.ok) return jsonError(result.status, result.error, { code: result.code });
  return NextResponse.json({ projectId: result.projectId }, { status: 202 });
}
