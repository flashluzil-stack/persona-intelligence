import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError, readJson } from "@/lib/api";
import { authLimiter } from "@/lib/security/rate-limit";

/**
 * Permanently deletes the signed-in user's account. The delete_my_account()
 * SQL function removes the auth user; all application data cascades.
 * Requires the confirmation phrase to avoid accidental deletion.
 */
export async function POST(request: NextRequest) {
  const g = await guard(request, { limiter: authLimiter });
  if ("response" in g) return g.response;
  const body = (await readJson(request)) as { confirm?: string } | null;
  if (body?.confirm !== "DELETE") return jsonError(400, g.t.errors.confirmDelete);
  const { supabase } = g.auth;
  const { getEntitlements } = await import("@/lib/billing/entitlements");
  const ent = await getEntitlements(supabase);
  if (ent.subscription && ent.subscription.status !== "canceled" && !ent.subscription.cancelAtPeriodEnd) {
    return jsonError(409, g.t.errors.activeSubscription, { code: "active_subscription" });
  }
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return jsonError(500, g.t.errors.deleteAccountFailed);
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
