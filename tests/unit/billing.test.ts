import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { annualSavingsPercent, getCatalog, productByPriceId } from "@/lib/billing/catalog";
import { verifyPaddleSignature, type PaddleEvent } from "@/lib/billing/paddle";
import { applyBillingEvent, type BillingRepository, type PurchaseRecord } from "@/lib/billing/webhook";

const SECRET = "pdl_ntfset_test_secret";
const ENV = {
  PADDLE_PRICE_SINGLE_REPORT: "pri_single",
  PADDLE_PRICE_CREDITS_SMALL: "pri_c5",
  PADDLE_PRICE_CREDITS_LARGE: "pri_c15",
  PADDLE_PRICE_MONTHLY: "pri_month",
  PADDLE_PRICE_ANNUAL: "pri_year",
};
const catalog = getCatalog(ENV);

function sign(body: string, ts: number, secret = SECRET) {
  return `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;
}

describe("Paddle webhook signature", () => {
  const body = JSON.stringify({ event_id: "evt_1", event_type: "transaction.completed", data: {} });
  const now = 1_800_000_000;

  it("accepts a valid signature", () => {
    expect(verifyPaddleSignature(body, sign(body, now), SECRET, now)).toBe(true);
  });
  it("rejects a tampered body, a wrong secret, a missing header and garbage", () => {
    expect(verifyPaddleSignature(body + " ", sign(body, now), SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(body, sign(body, now, "other"), SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(body, null, SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(body, "ts=abc;h1=zz", SECRET, now)).toBe(false);
  });
  it("rejects replayed (stale or future) timestamps", () => {
    expect(verifyPaddleSignature(body, sign(body, now - 301), SECRET, now)).toBe(false);
    expect(verifyPaddleSignature(body, sign(body, now + 301), SECRET, now)).toBe(false);
  });
  it("accepts any matching h1 during secret rotation", () => {
    const good = sign(body, now).split(";")[1];
    const header = `ts=${now};h1=${"0".repeat(64)};${good}`;
    expect(verifyPaddleSignature(body, header, SECRET, now)).toBe(true);
  });
});

describe("product catalogue", () => {
  it("maps Paddle prices to products and computes annual savings", () => {
    expect(productByPriceId("pri_year", catalog)?.key).toBe("annual");
    expect(productByPriceId("pri_unknown", catalog)).toBeNull();
    expect(annualSavingsPercent(catalog)).toBe(17);
    expect(catalog.credits_small.credits).toBe(5);
  });
  it("is configurable centrally and validates overrides", () => {
    const custom = getCatalog({ ...ENV, BILLING_CATALOG_JSON: JSON.stringify({ currency: "ils", products: { single_report: { amountMinor: 3900 } } }) });
    expect(custom.single_report.amountMinor).toBe(3900);
    expect(custom.single_report.currency).toBe("ILS");
    expect(() => getCatalog({ BILLING_CATALOG_JSON: JSON.stringify({ products: { single_report: { amountMinor: -1 } } }) })).toThrow();
  });
  it("has no price ids unless configured (purchases disabled)", () => {
    expect(getCatalog({}).monthly.priceId).toBeNull();
  });
});

/** In-memory repository mirroring the idempotent SQL functions. */
class FakeRepo implements BillingRepository {
  purchases = new Map<string, PurchaseRecord & { amount?: number | null }>();
  credits: Array<{ user: string; delta: number; key: string }> = [];
  unlocks = new Set<string>();
  subs = new Map<string, Parameters<BillingRepository["upsertSubscription"]>[0]>();
  customers = new Map<string, string>();
  events = new Map<string, string>();
  users = new Set(["user-a", "user-b"]);
  projectOf = new Map<string, string>();

  async recordEvent(id: string) {
    const s = this.events.get(id);
    if (!s) {
      this.events.set(id, "received");
      return "new" as const;
    }
    return s === "processed" || s === "ignored" ? ("processed" as const) : ("retry" as const);
  }
  async markEvent(id: string, status: "processed" | "ignored" | "failed") {
    this.events.set(id, status);
  }
  async findPurchase(id: string) {
    return this.purchases.get(id) ?? null;
  }
  async findPurchaseByTransaction(tx: string) {
    return [...this.purchases.values()].find((p) => p.providerTransactionId === tx) ?? null;
  }
  async completePurchase(id: string, tx: string, amount: number | null) {
    const p = this.purchases.get(id)!;
    if (p.status === "paid") return "already_paid";
    if (p.status === "refunded") return "refunded";
    p.status = "paid";
    p.providerTransactionId = tx;
    p.amount = amount;
    const product = catalog[p.productKey];
    if (p.kind === "credits") this.credits.push({ user: p.userId, delta: product.credits, key: `purchase:${id}` });
    if (p.kind === "report") this.unlocks.add(this.projectOf.get(id)!);
    return "completed";
  }
  async failPurchase(id: string) {
    this.purchases.get(id)!.status = "failed";
  }
  async refundPurchase(id: string) {
    const p = this.purchases.get(id)!;
    if (p.status === "refunded") return "already_refunded";
    p.status = "refunded";
    if (p.kind === "credits") this.credits.push({ user: p.userId, delta: -catalog[p.productKey].credits, key: `refund:${id}` });
    if (p.kind === "report") this.unlocks.delete(this.projectOf.get(id)!);
    return "refunded";
  }
  async upsertSubscription(args: Parameters<BillingRepository["upsertSubscription"]>[0]) {
    this.subs.set(args.providerSubscriptionId, args);
  }
  async setCustomer(user: string, customer: string) {
    this.customers.set(user, customer);
  }
  async userExists(id: string) {
    return this.users.has(id);
  }
  balance(user: string) {
    return this.credits.filter((c) => c.user === user).reduce((s, c) => s + c.delta, 0);
  }
}

function txEvent(type: string, data: Record<string, unknown>, id = `evt_${Math.random()}`): PaddleEvent {
  return { event_id: id, event_type: type, data };
}

function completed(purchaseId: string, txId: string, price: string, user = "user-a") {
  return txEvent("transaction.completed", {
    id: txId,
    status: "completed",
    customer_id: "ctm_1",
    custom_data: { purchase_id: purchaseId, user_id: user },
    currency_code: "USD",
    items: [{ price: { id: price } }],
    details: { totals: { grand_total: "900" } },
  });
}

describe("applyBillingEvent", () => {
  it("completes a single-report purchase and unlocks exactly that report", async () => {
    const repo = new FakeRepo();
    repo.purchases.set("p1", { id: "p1", userId: "user-a", productKey: "single_report", kind: "report", status: "pending", providerTransactionId: "txn_1" });
    repo.projectOf.set("p1", "project-1");
    const out = await applyBillingEvent(completed("p1", "txn_1", "pri_single"), repo, catalog);
    expect(out).toEqual({ status: "processed", detail: "purchase completed" });
    expect(repo.unlocks.has("project-1")).toBe(true);
    expect(repo.customers.get("user-a")).toBe("ctm_1");
  });

  it("grants credits once even when the webhook is delivered twice", async () => {
    const repo = new FakeRepo();
    repo.purchases.set("p2", { id: "p2", userId: "user-a", productKey: "credits_small", kind: "credits", status: "pending", providerTransactionId: "txn_2" });
    await applyBillingEvent(completed("p2", "txn_2", "pri_c5"), repo, catalog);
    const again = await applyBillingEvent(completed("p2", "txn_2", "pri_c5"), repo, catalog);
    expect(again.detail).toBe("purchase already_paid");
    expect(repo.balance("user-a")).toBe(5);
  });

  it("ignores a payment whose price does not match the purchase (no cheap-price unlocks)", async () => {
    const repo = new FakeRepo();
    repo.purchases.set("p3", { id: "p3", userId: "user-a", productKey: "credits_large", kind: "credits", status: "pending", providerTransactionId: "txn_3" });
    const out = await applyBillingEvent(completed("p3", "txn_3", "pri_c5"), repo, catalog);
    expect(out.status).toBe("ignored");
    expect(repo.balance("user-a")).toBe(0);
    expect(repo.purchases.get("p3")!.status).toBe("pending");
  });

  it("ignores a transaction that is not the one created for the purchase", async () => {
    const repo = new FakeRepo();
    repo.purchases.set("p4", { id: "p4", userId: "user-a", productKey: "single_report", kind: "report", status: "pending", providerTransactionId: "txn_server" });
    repo.projectOf.set("p4", "project-4");
    const out = await applyBillingEvent(completed("p4", "txn_client_made", "pri_single"), repo, catalog);
    expect(out.detail).toBe("transaction does not match purchase");
    expect(repo.unlocks.size).toBe(0);
  });

  it("ignores events for unknown purchases", async () => {
    const repo = new FakeRepo();
    expect((await applyBillingEvent(completed("nope", "txn_x", "pri_single"), repo, catalog)).status).toBe("ignored");
  });

  it("marks failed payments without granting anything", async () => {
    const repo = new FakeRepo();
    repo.purchases.set("p5", { id: "p5", userId: "user-a", productKey: "single_report", kind: "report", status: "pending", providerTransactionId: "txn_5" });
    await applyBillingEvent(txEvent("transaction.payment_failed", { id: "txn_5", status: "past_due", items: [] }), repo, catalog);
    expect(repo.purchases.get("p5")!.status).toBe("failed");
    expect(repo.unlocks.size).toBe(0);
  });

  it("tracks subscription lifecycle: active, cancel at period end, past due, canceled", async () => {
    const repo = new FakeRepo();
    const base = {
      id: "sub_1",
      customer_id: "ctm_9",
      custom_data: { user_id: "user-b" },
      items: [{ price: { id: "pri_year" } }],
      current_billing_period: { starts_at: "2026-10-01T00:00:00Z", ends_at: "2027-10-01T00:00:00Z" },
    };
    await applyBillingEvent(txEvent("subscription.created", { ...base, status: "active" }), repo, catalog);
    expect(repo.subs.get("sub_1")).toMatchObject({ userId: "user-b", productKey: "annual", status: "active", cancelAtPeriodEnd: false });
    await applyBillingEvent(txEvent("subscription.updated", { ...base, status: "active", scheduled_change: { action: "cancel", effective_at: "2027-10-01T00:00:00Z" } }), repo, catalog);
    expect(repo.subs.get("sub_1")!.cancelAtPeriodEnd).toBe(true);
    await applyBillingEvent(txEvent("subscription.past_due", { ...base, status: "past_due" }), repo, catalog);
    expect(repo.subs.get("sub_1")!.status).toBe("past_due");
    await applyBillingEvent(txEvent("subscription.canceled", { ...base, status: "canceled", canceled_at: "2027-10-01T00:00:00Z" }), repo, catalog);
    expect(repo.subs.get("sub_1")).toMatchObject({ status: "canceled", canceledAt: "2027-10-01T00:00:00Z" });
  });

  it("ignores subscriptions for unknown users or prices", async () => {
    const repo = new FakeRepo();
    const sub = { id: "sub_2", status: "active", items: [{ price: { id: "pri_year" } }] };
    expect((await applyBillingEvent(txEvent("subscription.created", { ...sub, custom_data: { user_id: "ghost" } }), repo, catalog)).status).toBe("ignored");
    expect((await applyBillingEvent(txEvent("subscription.created", { ...sub, custom_data: { user_id: "user-a" }, items: [{ price: { id: "pri_c5" } }] }), repo, catalog)).status).toBe("ignored");
    expect(repo.subs.size).toBe(0);
  });

  it("applies full approved refunds once and ignores partial or pending ones", async () => {
    const repo = new FakeRepo();
    repo.purchases.set("p6", { id: "p6", userId: "user-a", productKey: "credits_small", kind: "credits", status: "pending", providerTransactionId: "txn_6" });
    await applyBillingEvent(completed("p6", "txn_6", "pri_c5"), repo, catalog);
    const adj = (extra: Record<string, unknown>) => txEvent("adjustment.updated", { id: "adj_1", action: "refund", transaction_id: "txn_6", ...extra });
    expect((await applyBillingEvent(adj({ status: "pending_approval", type: "full" }), repo, catalog)).status).toBe("ignored");
    expect((await applyBillingEvent(adj({ status: "approved", type: "partial" }), repo, catalog)).status).toBe("ignored");
    expect(repo.balance("user-a")).toBe(5);
    await applyBillingEvent(adj({ status: "approved", type: "full" }), repo, catalog);
    const again = await applyBillingEvent(adj({ status: "approved", type: "full" }), repo, catalog);
    expect(again.detail).toBe("refund already_refunded");
    expect(repo.balance("user-a")).toBe(0);
    // A replayed completion after the refund must not re-grant credits.
    await applyBillingEvent(completed("p6", "txn_6", "pri_c5"), repo, catalog);
    expect(repo.balance("user-a")).toBe(0);
  });

  it("re-locks a refunded single report", async () => {
    const repo = new FakeRepo();
    repo.purchases.set("p7", { id: "p7", userId: "user-a", productKey: "single_report", kind: "report", status: "pending", providerTransactionId: "txn_7" });
    repo.projectOf.set("p7", "project-7");
    await applyBillingEvent(completed("p7", "txn_7", "pri_single"), repo, catalog);
    await applyBillingEvent(txEvent("adjustment.created", { id: "adj_7", action: "chargeback", status: "approved", transaction_id: "txn_7" }), repo, catalog);
    expect(repo.unlocks.has("project-7")).toBe(false);
  });
});
