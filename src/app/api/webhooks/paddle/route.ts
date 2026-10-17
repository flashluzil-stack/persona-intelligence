import { NextResponse } from "next/server";
import { verifyPaddleSignature, paddleEventSchema } from "@/lib/billing/paddle";
import { SupabaseBillingRepository } from "@/lib/billing/repository";
import { applyBillingEvent } from "@/lib/billing/webhook";
import { getPaddleConfig, getServiceRoleKey } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Paddle webhook endpoint. The ONLY place entitlements are granted.
 * 1. Verify the HMAC signature over the raw body (reject otherwise).
 * 2. Record the event id (idempotent; duplicates acknowledged without re-applying).
 * 3. Apply via transactional SQL functions; on failure respond 500 so Paddle retries.
 */
export async function POST(request: Request) {
  const cfg = getPaddleConfig();
  if (!cfg || !getServiceRoleKey()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verifyPaddleSignature(raw, request.headers.get("paddle-signature"), cfg.webhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let event;
  try {
    event = paddleEventSchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const repo = new SupabaseBillingRepository(createServiceClient());
  const seen = await repo.recordEvent(event.event_id, event.event_type, event);
  if (seen === "processed") return NextResponse.json({ ok: true, duplicate: true });
  try {
    const outcome = await applyBillingEvent(event, repo);
    await repo.markEvent(event.event_id, outcome.status, outcome.detail);
    return NextResponse.json({ ok: true, outcome: outcome.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing failed";
    console.error("[webhook] processing failed", event.event_type, message);
    await repo.markEvent(event.event_id, "failed", message).catch(() => {});
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
