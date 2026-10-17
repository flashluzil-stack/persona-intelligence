import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError, readJson } from "@/lib/api";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getAccessConfig, getServiceRoleKey } from "@/lib/config";
import { mutationLimiter } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ method: z.enum(["credits", "subscription"]) });

/**
 * Unlocks a report with credits or an active subscription. Ownership is checked
 * with the user's client; the entitlement change runs in an atomic SQL
 * function (advisory lock + unique idempotency keys) via the service role.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guard(request, { limiter: mutationLimiter });
  if ("response" in g) return g.response;
  const { t } = g;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, t.errors.notFound);
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, t.errors.invalidBody);
  if (!getServiceRoleKey()) return jsonError(503, t.errors.paymentsNotConfigured);
  const { supabase, user } = g.auth;
  const { data: project } = await supabase.from("research_projects").select("id").eq("id", id).maybeSingle();
  if (!project) return jsonError(404, t.errors.notFound);

  const admin = createServiceClient();
  let result: string | null = null;
  if (parsed.data.method === "credits") {
    const { data, error } = await admin.rpc("billing_unlock_with_credits", { p_user: user.id, p_project: id, p_cost: getAccessConfig().creditsPerReport });
    if (error) return jsonError(500, t.errors.saveFailed);
    result = data as string;
  } else {
    const ent = await getEntitlements(supabase);
    const limit = ent.subscription?.periodLimit ?? 0;
    const { data, error } = await admin.rpc("billing_unlock_with_subscription", { p_user: user.id, p_project: id, p_period_limit: limit });
    if (error) return jsonError(500, t.errors.saveFailed);
    result = data as string;
  }
  const messages: Record<string, [number, string]> = {
    unlocked: [200, t.paywall.unlocked],
    already_unlocked: [200, t.paywall.alreadyUnlocked],
    insufficient_credits: [402, t.paywall.insufficientCredits],
    not_ready: [409, t.paywall.notReady],
    fair_use_limit: [429, t.paywall.fairUseLimit],
    no_subscription: [402, t.paywall.noSubscription],
    not_found: [404, t.errors.notFound],
  };
  const [status, message] = messages[result ?? ""] ?? [500, t.errors.saveFailed];
  if (result === "unlocked") {
    await supabase.from("audit_events").insert({ user_id: user.id, event_type: "report.unlocked", metadata: { projectId: id, method: parsed.data.method } });
  }
  return status === 200 ? NextResponse.json({ ok: true, result, message }) : jsonError(status, message, { code: result });
}
