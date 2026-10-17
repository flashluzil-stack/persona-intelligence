import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { PaddleClient } from "@/lib/billing/paddle";
import { getPaddleConfig } from "@/lib/config";

/** Redirects to Paddle's customer portal (payment methods, invoices/receipts, subscription). */
export async function GET(request: NextRequest) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const paddle = getPaddleConfig();
  if (!paddle) return jsonError(503, g.t.errors.paymentsNotConfigured);
  const { data: customer } = await g.auth.supabase.from("billing_customers").select("provider_customer_id").maybeSingle();
  if (!customer) return jsonError(404, g.t.billingPanel.noPurchases);
  const { data: subs } = await g.auth.supabase.from("subscriptions").select("provider_subscription_id").neq("status", "canceled");
  try {
    const url = await new PaddleClient(paddle).customerPortalUrl(customer.provider_customer_id, (subs ?? []).map((s) => s.provider_subscription_id));
    return NextResponse.redirect(url, 303);
  } catch {
    return jsonError(502, g.t.errors.loadFailed);
  }
}
