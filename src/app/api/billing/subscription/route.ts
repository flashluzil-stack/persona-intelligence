import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError, readJson } from "@/lib/api";
import { getEntitlements } from "@/lib/billing/entitlements";
import { PaddleClient } from "@/lib/billing/paddle";
import { getPaddleConfig } from "@/lib/config";
import { mutationLimiter } from "@/lib/security/rate-limit";

const bodySchema = z.object({ action: z.enum(["cancel", "resume"]) });

/**
 * Cancels renewal (effective at period end) or resumes it. The local record
 * is updated by the resulting signed subscription.updated webhook — never here.
 */
export async function POST(request: NextRequest) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { t } = g;
  const paddle = getPaddleConfig();
  if (!paddle) return jsonError(503, t.errors.paymentsNotConfigured);
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, t.errors.invalidBody);
  const ent = await getEntitlements(g.auth.supabase);
  const sub = ent.subscription;
  if (!sub || sub.status === "canceled") return jsonError(404, t.paywall.noSubscription);
  try {
    const client = new PaddleClient(paddle);
    if (parsed.data.action === "cancel") await client.cancelSubscriptionAtPeriodEnd(sub.providerSubscriptionId);
    else await client.resumeSubscription(sub.providerSubscriptionId);
  } catch {
    return jsonError(502, t.errors.saveFailed);
  }
  await g.auth.supabase.from("audit_events").insert({ user_id: g.auth.user.id, event_type: `billing.subscription_${parsed.data.action}`, metadata: {} });
  return NextResponse.json({ ok: true });
}
