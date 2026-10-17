import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaddleConfig } from "@/lib/config";

/**
 * Paddle Billing integration (merchant of record).
 * Docs: https://developer.paddle.com — transactions, subscriptions,
 * customer portal sessions and webhook signature verification.
 */

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

const apiBase = (env: PaddleConfig["environment"]) => (env === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com");

export interface PaddleClientOptions {
  fetchImpl?: typeof fetch;
}

export class PaddleClient {
  constructor(
    private readonly cfg: PaddleConfig,
    private readonly opts: PaddleClientOptions = {},
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await (this.opts.fetchImpl ?? fetch)(`${apiBase(this.cfg.environment)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { detail?: string } };
    if (!res.ok || json.data === undefined) {
      // Log details server-side only; never echo provider responses to clients.
      console.error("[paddle] request failed", method, path, res.status, json.error?.detail);
      throw new PaymentProviderError(`Payment provider request failed (${res.status})`, res.status);
    }
    return json.data;
  }

  /**
   * Creates a server-side transaction. Price and custom_data are fixed here,
   * so the browser can only open checkout for exactly this transaction.
   */
  async createTransaction(args: { priceId: string; customData: Record<string, string>; customerId?: string | null; email?: string | null }) {
    const data = await this.request<{ id: string; checkout?: { url?: string | null } }>("POST", "/transactions", {
      items: [{ price_id: args.priceId, quantity: 1 }],
      custom_data: args.customData,
      collection_mode: "automatic",
      ...(args.customerId ? { customer_id: args.customerId } : {}),
    });
    return { transactionId: data.id, checkoutUrl: data.checkout?.url ?? null };
  }

  async cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
    await this.request("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { effective_from: "next_billing_period" });
  }

  async resumeSubscription(subscriptionId: string) {
    await this.request("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { scheduled_change: null });
  }

  async customerPortalUrl(customerId: string, subscriptionIds: string[]): Promise<string> {
    const data = await this.request<{ urls: { general: { overview: string } } }>("POST", `/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
      subscription_ids: subscriptionIds,
    });
    return data.urls.general.overview;
  }
}

/**
 * Verifies a Paddle webhook signature (`Paddle-Signature: ts=…;h1=…`):
 * HMAC-SHA256 over `${ts}:${rawBody}` with the endpoint secret, compared in
 * constant time, rejecting stale timestamps to limit replay.
 */
export function verifyPaddleSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  if (!header) return false;
  let ts = NaN;
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "ts") ts = Number(value);
    // Several h1 values can be present while a secret is being rotated.
    else if (key === "h1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value);
  }
  if (!Number.isFinite(ts) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest();
  return signatures.some((h1) => {
    const given = Buffer.from(h1, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Minimal, validated shape of the Paddle events we act on. */
export const paddleEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  occurred_at: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});
export type PaddleEvent = z.infer<typeof paddleEventSchema>;

export const transactionDataSchema = z.object({
  id: z.string(),
  status: z.string(),
  customer_id: z.string().nullable().optional(),
  subscription_id: z.string().nullable().optional(),
  custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
  currency_code: z.string().optional(),
  items: z.array(z.object({ price: z.object({ id: z.string() }).passthrough() }).passthrough()).default([]),
  details: z.object({ totals: z.object({ total: z.string().optional(), grand_total: z.string().optional() }).passthrough().optional() }).passthrough().nullable().optional(),
});

export const subscriptionDataSchema = z.object({
  id: z.string(),
  status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]),
  customer_id: z.string().nullable().optional(),
  custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
  items: z.array(z.object({ price: z.object({ id: z.string() }).passthrough() }).passthrough()).default([]),
  current_billing_period: z.object({ starts_at: z.string(), ends_at: z.string() }).nullable().optional(),
  scheduled_change: z.object({ action: z.string(), effective_at: z.string().optional() }).nullable().optional(),
  canceled_at: z.string().nullable().optional(),
});

export const adjustmentDataSchema = z.object({
  id: z.string(),
  action: z.string(),
  status: z.string(),
  transaction_id: z.string(),
  type: z.string().optional(),
});
