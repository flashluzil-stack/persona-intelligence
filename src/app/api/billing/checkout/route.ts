import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, jsonError, readJson } from "@/lib/api";
import { getCatalog, PRODUCT_KEYS } from "@/lib/billing/catalog";
import { PaddleClient } from "@/lib/billing/paddle";
import { isReportBillable } from "@/lib/billing/readiness";
import { getPaddleConfig, getServiceRoleKey } from "@/lib/config";
import { aiActionLimiter } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ product: z.enum(PRODUCT_KEYS), projectId: z.uuid().optional() });

/**
 * Starts a purchase. The server records a pending purchase, then creates the
 * Paddle transaction with fixed price and custom data. The browser only opens
 * checkout for that transaction; entitlements are granted by the signed webhook.
 */
export async function POST(request: NextRequest) {
  const g = await guard(request, { limiter: aiActionLimiter });
  if ("response" in g) return g.response;
  const { t } = g;
  const { supabase, user } = g.auth;
  const paddle = getPaddleConfig();
  if (!paddle || !getServiceRoleKey()) return jsonError(503, t.errors.paymentsNotConfigured);
  if (user.is_anonymous || !user.email) return jsonError(403, t.errors.guestCannotPurchase, { code: "account_required" });

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, t.errors.unknownProduct);
  const product = getCatalog()[parsed.data.product];
  if (!product.priceId) return jsonError(503, t.errors.paymentsNotConfigured);

  let projectId: string | null = null;
  if (product.kind === "report") {
    if (!parsed.data.projectId) return jsonError(400, t.errors.notFound);
    // Ownership check with the user's own client (RLS).
    const { data: project } = await supabase.from("research_projects").select("id").eq("id", parsed.data.projectId).maybeSingle();
    if (!project) return jsonError(404, t.errors.notFound);
    const { data: unlocked } = await supabase.from("report_unlocks").select("research_project_id").eq("research_project_id", project.id).maybeSingle();
    if (unlocked) return jsonError(409, t.paywall.alreadyUnlocked, { code: "already_unlocked" });
    if (!(await isReportBillable(supabase, project.id))) return jsonError(409, t.paywall.notReady, { code: "not_ready" });
    projectId = project.id;
  }

  const admin = createServiceClient();
  const { data: purchase, error } = await admin
    .from("purchases")
    .insert({ user_id: user.id, provider: "paddle", product_key: product.key, kind: product.kind, research_project_id: projectId, credits: product.credits, currency: product.currency, amount_minor: product.amountMinor })
    .select("id")
    .single();
  if (error || !purchase) return jsonError(500, t.errors.checkoutFailed);

  try {
    const { data: customer } = await supabase.from("billing_customers").select("provider_customer_id").maybeSingle();
    const client = new PaddleClient(paddle);
    const tx = await client.createTransaction({
      priceId: product.priceId,
      customData: { purchase_id: purchase.id, user_id: user.id },
      customerId: customer?.provider_customer_id ?? null,
    });
    await admin.from("purchases").update({ provider_transaction_id: tx.transactionId }).eq("id", purchase.id);
    await supabase.from("audit_events").insert({ user_id: user.id, event_type: "billing.checkout_started", metadata: { purchaseId: purchase.id, product: product.key } });
    return NextResponse.json({
      purchaseId: purchase.id,
      transactionId: tx.transactionId,
      clientToken: paddle.clientToken,
      environment: paddle.environment,
      email: user.email,
    });
  } catch {
    await admin.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
    return jsonError(502, t.errors.checkoutFailed);
  }
}
