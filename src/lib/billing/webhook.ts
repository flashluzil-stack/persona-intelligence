import { getCatalog, productByPriceId, type ProductKey } from "./catalog";
import { adjustmentDataSchema, subscriptionDataSchema, transactionDataSchema, type PaddleEvent } from "./paddle";

/**
 * Applies verified payment-provider events to entitlements. Pure business
 * logic over a repository interface, so it is unit-testable without a database.
 * The repository implementation calls transactional, idempotent SQL functions.
 */

export interface PurchaseRecord {
  id: string;
  userId: string;
  productKey: ProductKey;
  kind: "report" | "credits" | "subscription";
  status: string;
  providerTransactionId: string | null;
}

export interface BillingRepository {
  /** Returns "new" for a first delivery, "processed" if already handled, "retry" for an earlier failed attempt. */
  recordEvent(eventId: string, eventType: string, payload: unknown): Promise<"new" | "processed" | "retry">;
  markEvent(eventId: string, status: "processed" | "ignored" | "failed", error?: string): Promise<void>;
  findPurchase(id: string): Promise<PurchaseRecord | null>;
  findPurchaseByTransaction(transactionId: string): Promise<PurchaseRecord | null>;
  completePurchase(id: string, transactionId: string, amountMinor: number | null, currency: string | null, subscriptionId: string | null): Promise<string>;
  failPurchase(id: string): Promise<void>;
  refundPurchase(id: string): Promise<string>;
  upsertSubscription(args: {
    userId: string;
    providerSubscriptionId: string;
    productKey: ProductKey;
    status: "active" | "trialing" | "past_due" | "paused" | "canceled";
    periodStart: string | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
  }): Promise<void>;
  setCustomer(userId: string, customerId: string): Promise<void>;
  userExists(userId: string): Promise<boolean>;
}

export type EventOutcome = { status: "processed" | "ignored"; detail: string };

const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 200 ? v : null);

export async function applyBillingEvent(event: PaddleEvent, repo: BillingRepository, catalog = getCatalog()): Promise<EventOutcome> {
  const type = event.event_type;

  if (type === "transaction.completed" || type === "transaction.paid") {
    const tx = transactionDataSchema.parse(event.data);
    if (type === "transaction.paid" && tx.status !== "completed" && tx.status !== "paid") {
      return { status: "ignored", detail: `transaction status ${tx.status}` };
    }
    const purchaseId = str(tx.custom_data?.purchase_id);
    const purchase = (purchaseId ? await repo.findPurchase(purchaseId) : null) ?? (await repo.findPurchaseByTransaction(tx.id));
    if (!purchase) return { status: "ignored", detail: "no matching purchase" };
    if (purchase.providerTransactionId && purchase.providerTransactionId !== tx.id) {
      return { status: "ignored", detail: "transaction does not match purchase" };
    }
    // The paid item must be the product this purchase was created for.
    const expectedPrice = catalog[purchase.productKey]?.priceId;
    if (!expectedPrice || !tx.items.some((i) => i.price.id === expectedPrice)) {
      return { status: "ignored", detail: "price does not match purchase" };
    }
    const total = tx.details?.totals?.grand_total ?? tx.details?.totals?.total;
    const amount = total && /^\d+$/.test(total) ? Number(total) : null;
    const result = await repo.completePurchase(purchase.id, tx.id, amount, tx.currency_code ?? null, tx.subscription_id ?? null);
    if (tx.customer_id) await repo.setCustomer(purchase.userId, tx.customer_id);
    return { status: "processed", detail: `purchase ${result}` };
  }

  if (type === "transaction.payment_failed") {
    const tx = transactionDataSchema.parse(event.data);
    const purchase = await repo.findPurchaseByTransaction(tx.id);
    if (purchase && purchase.status === "pending") await repo.failPurchase(purchase.id);
    return { status: purchase ? "processed" : "ignored", detail: "payment failed" };
  }

  if (type.startsWith("subscription.")) {
    const sub = subscriptionDataSchema.parse(event.data);
    const userId = str(sub.custom_data?.user_id);
    if (!userId || !(await repo.userExists(userId))) return { status: "ignored", detail: "subscription without a known user" };
    const product = sub.items.map((i) => productByPriceId(i.price.id, catalog)).find((p) => p && p.kind === "subscription");
    if (!product) return { status: "ignored", detail: "subscription price not in catalogue" };
    await repo.upsertSubscription({
      userId,
      providerSubscriptionId: sub.id,
      productKey: product.key,
      status: sub.status,
      periodStart: sub.current_billing_period?.starts_at ?? null,
      periodEnd: sub.current_billing_period?.ends_at ?? null,
      cancelAtPeriodEnd: sub.scheduled_change?.action === "cancel",
      canceledAt: sub.canceled_at ?? null,
    });
    if (sub.customer_id) await repo.setCustomer(userId, sub.customer_id);
    return { status: "processed", detail: `subscription ${sub.status}` };
  }

  if (type === "adjustment.created" || type === "adjustment.updated") {
    const adj = adjustmentDataSchema.parse(event.data);
    if (adj.action !== "refund" && adj.action !== "chargeback") return { status: "ignored", detail: `adjustment ${adj.action}` };
    if (adj.status !== "approved") return { status: "ignored", detail: `adjustment ${adj.status}` };
    if (adj.type && adj.type !== "full") return { status: "ignored", detail: "partial refund; entitlements unchanged" };
    const purchase = await repo.findPurchaseByTransaction(adj.transaction_id);
    if (!purchase) return { status: "ignored", detail: "no matching purchase" };
    const result = await repo.refundPurchase(purchase.id);
    return { status: "processed", detail: `refund ${result}` };
  }

  return { status: "ignored", detail: `unhandled event ${type}` };
}
