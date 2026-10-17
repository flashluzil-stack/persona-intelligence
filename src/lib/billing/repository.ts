import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_KEYS, type ProductKey } from "./catalog";
import type { BillingRepository, PurchaseRecord } from "./webhook";

const PROVIDER = "paddle";

function mapPurchase(r: Record<string, unknown>): PurchaseRecord | null {
  const key = r.product_key as string;
  if (!(PRODUCT_KEYS as readonly string[]).includes(key)) return null;
  return {
    id: r.id as string,
    userId: r.user_id as string,
    productKey: key as ProductKey,
    kind: r.kind as PurchaseRecord["kind"],
    status: r.status as string,
    providerTransactionId: (r.provider_transaction_id as string | null) ?? null,
  };
}

function must<T>(op: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`billing ${op} failed: ${res.error.message}`);
  return res.data as T;
}

/** BillingRepository backed by the service-role client and transactional SQL functions. */
export class SupabaseBillingRepository implements BillingRepository {
  constructor(private readonly db: SupabaseClient) {}

  async recordEvent(eventId: string, eventType: string, payload: unknown) {
    const { error } = await this.db.from("billing_events").insert({ provider: PROVIDER, event_id: eventId, event_type: eventType, payload });
    if (!error) return "new" as const;
    if (error.code !== "23505") throw new Error(`billing recordEvent failed: ${error.message}`);
    const existing = must<{ status: string } | null>(
      "loadEvent",
      await this.db.from("billing_events").select("status").eq("provider", PROVIDER).eq("event_id", eventId).maybeSingle(),
    );
    return existing && (existing.status === "processed" || existing.status === "ignored") ? ("processed" as const) : ("retry" as const);
  }

  async markEvent(eventId: string, status: "processed" | "ignored" | "failed", errorText?: string) {
    must(
      "markEvent",
      await this.db
        .from("billing_events")
        .update({ status, error: errorText?.slice(0, 1000) ?? null, processed_at: new Date().toISOString() })
        .eq("provider", PROVIDER)
        .eq("event_id", eventId),
    );
  }

  async findPurchase(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = must<Record<string, unknown> | null>("findPurchase", await this.db.from("purchases").select("*").eq("id", id).maybeSingle());
    return r ? mapPurchase(r) : null;
  }

  async findPurchaseByTransaction(transactionId: string) {
    const r = must<Record<string, unknown> | null>(
      "findPurchaseByTransaction",
      await this.db.from("purchases").select("*").eq("provider_transaction_id", transactionId).maybeSingle(),
    );
    return r ? mapPurchase(r) : null;
  }

  async completePurchase(id: string, transactionId: string, amountMinor: number | null, currency: string | null, subscriptionId: string | null) {
    return must<string>(
      "completePurchase",
      await this.db.rpc("billing_complete_purchase", {
        p_purchase: id,
        p_transaction: transactionId,
        p_amount_minor: amountMinor,
        p_currency: currency,
        p_subscription: subscriptionId,
      }),
    );
  }

  async failPurchase(id: string) {
    must("failPurchase", await this.db.from("purchases").update({ status: "failed" }).eq("id", id).eq("status", "pending"));
  }

  async refundPurchase(id: string) {
    return must<string>("refundPurchase", await this.db.rpc("billing_refund_purchase", { p_purchase: id }));
  }

  async upsertSubscription(a: Parameters<BillingRepository["upsertSubscription"]>[0]) {
    must(
      "upsertSubscription",
      await this.db.rpc("billing_upsert_subscription", {
        p_user: a.userId,
        p_provider: PROVIDER,
        p_provider_subscription: a.providerSubscriptionId,
        p_product: a.productKey,
        p_status: a.status,
        p_period_start: a.periodStart,
        p_period_end: a.periodEnd,
        p_cancel_at_period_end: a.cancelAtPeriodEnd,
        p_canceled_at: a.canceledAt,
      }),
    );
  }

  async setCustomer(userId: string, customerId: string) {
    must(
      "setCustomer",
      await this.db.from("billing_customers").upsert({ user_id: userId, provider: PROVIDER, provider_customer_id: customerId }, { onConflict: "user_id" }),
    );
  }

  async userExists(userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
    const { data } = await this.db.auth.admin.getUserById(userId);
    return Boolean(data?.user);
  }
}
