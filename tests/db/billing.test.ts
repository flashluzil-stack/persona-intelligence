import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Billing and entitlement functions against real PostgreSQL (see scripts/test-db.sh).
 * Skipped when TEST_DATABASE_URL is not set.
 */

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

let admin: Client;

async function as<T>(role: "authenticated" | "service_role", userId: string | null, fn: (c: Client) => Promise<T>, client = admin): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const r = await fn(client);
    await client.query("commit");
    return r;
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

async function user(anonymous = false) {
  const id = randomUUID();
  await admin.query("insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)", [id, anonymous ? null : `${id}@t.local`, anonymous]);
  return id;
}

async function project(userId: string, ready = true) {
  const { rows } = await admin.query("insert into public.research_projects (user_id, name, input) values ($1, 'P', '{}') returning id", [userId]);
  const id = rows[0].id as string;
  if (ready) {
    await admin.query(
      "insert into public.profile_sections (user_id, research_project_id, section_type, structured_content) values ($1, $2, 'overview', '{}')",
      [userId, id],
    );
  }
  return id;
}

async function purchase(userId: string, kind: "report" | "credits", opts: { projectId?: string; credits?: number } = {}) {
  const { rows } = await admin.query(
    "insert into public.purchases (user_id, provider, product_key, kind, research_project_id, credits, provider_transaction_id) values ($1, 'test', $2, $3, $4, $5, $6) returning id",
    [userId, kind === "report" ? "single_report" : "credits_5", kind, opts.projectId ?? null, opts.credits ?? 0, `txn_${randomUUID()}`],
  );
  return rows[0].id as string;
}

const svc = <T>(sql: string, params: unknown[]) => as("service_role", null, (c) => c.query(sql, params)) as unknown as Promise<{ rows: T[] }>;
const balance = async (u: string) => (await svc<{ b: number }>("select public.billing_credit_balance($1) as b", [u])).rows[0].b;
const unlocked = async (p: string) => (await admin.query("select 1 from public.report_unlocks where research_project_id = $1", [p])).rowCount === 1;

d("billing and entitlements", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url });
    await admin.connect();
  });
  afterAll(async () => {
    await admin?.end();
  });

  it("users can read but never write their own billing rows", async () => {
    const u = await user();
    const p = await project(u);
    await purchase(u, "report", { projectId: p });
    const read = await as("authenticated", u, (c) => c.query("select id from public.purchases"));
    expect(read.rowCount).toBe(1);
    await expect(as("authenticated", u, (c) => c.query("update public.purchases set status = 'paid'"))).rejects.toThrow(/permission denied/);
    await expect(
      as("authenticated", u, (c) => c.query("insert into public.report_unlocks (research_project_id, user_id, source) values ($1, $2, 'admin')", [p, u])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("authenticated", u, (c) => c.query("insert into public.credit_ledger (user_id, delta, reason, idempotency_key) values ($1, 100, 'adjustment', 'x')", [u])),
    ).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", u, (c) => c.query("select * from public.billing_events"))).rejects.toThrow(/permission denied/);
  });

  it("users cannot call entitlement functions directly", async () => {
    const u = await user();
    const p = await project(u);
    await expect(as("authenticated", u, (c) => c.query("select public.billing_unlock_with_credits($1, $2, 1)", [u, p]))).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", u, (c) => c.query("select public.billing_complete_purchase($1, 'x', 1, 'USD', null)", [randomUUID()]))).rejects.toThrow(/permission denied/);
  });

  it("other users cannot see someone's purchases, credits or unlocks", async () => {
    const a = await user();
    const b = await user();
    const p = await project(a);
    const pid = await purchase(a, "credits", { credits: 5 });
    await svc("select public.billing_complete_purchase($1, (select provider_transaction_id from public.purchases where id = $1), 1000, 'USD', null)", [pid]);
    for (const table of ["purchases", "credit_ledger", "report_unlocks"]) {
      const r = await as("authenticated", b, (c) => c.query(`select 1 from public.${table} where user_id = $1`, [a]));
      expect(r.rowCount, table).toBe(0);
    }
    expect(p).toBeTruthy();
  });

  it("grants credits exactly once even when the webhook is retried", async () => {
    const u = await user();
    const pid = await purchase(u, "credits", { credits: 5 });
    const txn = (await admin.query("select provider_transaction_id t from public.purchases where id = $1", [pid])).rows[0].t;
    for (let i = 0; i < 3; i++) {
      const r = await svc<{ r: string }>("select public.billing_complete_purchase($1, $2, 3500, 'USD', null) as r", [pid, txn]);
      expect(r.rows[0].r).toBe("paid");
    }
    expect(await balance(u)).toBe(5);
  });

  it("rejects a completion for a different transaction", async () => {
    const u = await user();
    const pid = await purchase(u, "credits", { credits: 5 });
    const r = await svc<{ r: string }>("select public.billing_complete_purchase($1, 'txn_other', 3500, 'USD', null) as r", [pid]);
    expect(r.rows[0].r).toBe("transaction_mismatch");
    expect(await balance(u)).toBe(0);
  });

  it("unlocks the purchased report for its owner only", async () => {
    const u = await user();
    const p = await project(u);
    const pid = await purchase(u, "report", { projectId: p });
    const txn = (await admin.query("select provider_transaction_id t from public.purchases where id = $1", [pid])).rows[0].t;
    await svc("select public.billing_complete_purchase($1, $2, 900, 'USD', null)", [pid, txn]);
    expect(await unlocked(p)).toBe(true);

    // A purchase row pointing at someone else's report never unlocks it.
    const other = await user();
    const otherProject = await project(other);
    const sneaky = await purchase(u, "report", { projectId: otherProject });
    const t2 = (await admin.query("select provider_transaction_id t from public.purchases where id = $1", [sneaky])).rows[0].t;
    await svc("select public.billing_complete_purchase($1, $2, 900, 'USD', null)", [sneaky, t2]);
    expect(await unlocked(otherProject)).toBe(false);
  });

  it("spends credits atomically: concurrent unlock requests deduct once", async () => {
    const u = await user();
    const p = await project(u);
    const pid = await purchase(u, "credits", { credits: 1 });
    const txn = (await admin.query("select provider_transaction_id t from public.purchases where id = $1", [pid])).rows[0].t;
    await svc("select public.billing_complete_purchase($1, $2, 900, 'USD', null)", [pid, txn]);

    const clients = await Promise.all([0, 1, 2, 3].map(async () => {
      const c = new Client({ connectionString: url });
      await c.connect();
      return c;
    }));
    const results = await Promise.all(
      clients.map((c) => as("service_role", null, (cl) => cl.query("select public.billing_unlock_with_credits($1, $2, 1) as r", [u, p]), c)),
    );
    await Promise.all(clients.map((c) => c.end()));
    const outcomes = results.map((r) => r.rows[0].r).sort();
    expect(outcomes.filter((o) => o === "unlocked")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "already_unlocked")).toHaveLength(3);
    expect(await balance(u)).toBe(0);
  });

  it("refuses to spend credits without balance, on unready reports, or on others' reports", async () => {
    const u = await user();
    const ready = await project(u);
    const notReady = await project(u, false);
    const r1 = await svc<{ r: string }>("select public.billing_unlock_with_credits($1, $2, 1) as r", [u, ready]);
    expect(r1.rows[0].r).toBe("insufficient_credits");
    const r2 = await svc<{ r: string }>("select public.billing_unlock_with_credits($1, $2, 1) as r", [u, notReady]);
    expect(r2.rows[0].r).toBe("not_ready");
    const stranger = await user();
    const r3 = await svc<{ r: string }>("select public.billing_unlock_with_credits($1, $2, 1) as r", [stranger, ready]);
    expect(r3.rows[0].r).toBe("not_found");
  });

  it("reverses refunds idempotently", async () => {
    const u = await user();
    const p = await project(u);
    const reportPurchase = await purchase(u, "report", { projectId: p });
    const creditPurchase = await purchase(u, "credits", { credits: 3 });
    for (const id of [reportPurchase, creditPurchase]) {
      const t = (await admin.query("select provider_transaction_id t from public.purchases where id = $1", [id])).rows[0].t;
      await svc("select public.billing_complete_purchase($1, $2, 900, 'USD', null)", [id, t]);
    }
    expect(await unlocked(p)).toBe(true);
    expect(await balance(u)).toBe(3);
    for (let i = 0; i < 2; i++) {
      await svc("select public.billing_refund_purchase($1)", [reportPurchase]);
      await svc("select public.billing_refund_purchase($1)", [creditPurchase]);
    }
    expect(await unlocked(p)).toBe(false);
    expect(await balance(u)).toBe(0);
    // A late "completed" retry after the refund does not re-grant.
    const t = (await admin.query("select provider_transaction_id t from public.purchases where id = $1", [creditPurchase])).rows[0].t;
    const r = await svc<{ r: string }>("select public.billing_complete_purchase($1, $2, 900, 'USD', null) as r", [creditPurchase, t]);
    expect(r.rows[0].r).toBe("refunded");
    expect(await balance(u)).toBe(0);
  });

  describe("subscriptions", () => {
    const upsert = (u: string, subId: string, status: string, start: string, end: string, cancelAtEnd = false) =>
      svc("select public.billing_upsert_subscription($1, 'test', $2, 'monthly', $3, $4, $5, $6, null)", [u, subId, status, start, end, cancelAtEnd]);

    it("unlocks reports while active and enforces the fair-use limit per period", async () => {
      const u = await user();
      const sub = `sub_${randomUUID()}`;
      await upsert(u, sub, "active", new Date(Date.now() - 86400e3).toISOString(), new Date(Date.now() + 29 * 86400e3).toISOString());
      const p1 = await project(u);
      const p2 = await project(u);
      const r1 = await svc<{ r: string }>("select public.billing_unlock_with_subscription($1, $2, 1) as r", [u, p1]);
      const r2 = await svc<{ r: string }>("select public.billing_unlock_with_subscription($1, $2, 1) as r", [u, p2]);
      expect(r1.rows[0].r).toBe("unlocked");
      expect(r2.rows[0].r).toBe("fair_use_limit");
    });

    it("keeps access until the paid period ends after cancellation, then stops", async () => {
      const u = await user();
      const sub = `sub_${randomUUID()}`;
      const start = new Date(Date.now() - 10 * 86400e3).toISOString();
      await upsert(u, sub, "canceled", start, new Date(Date.now() + 5 * 86400e3).toISOString(), true);
      const p1 = await project(u);
      expect((await svc<{ r: string }>("select public.billing_unlock_with_subscription($1, $2, 10) as r", [u, p1])).rows[0].r).toBe("unlocked");
      // Period over → no access for new reports.
      await upsert(u, sub, "canceled", start, new Date(Date.now() - 86400e3).toISOString(), true);
      const p2 = await project(u);
      expect((await svc<{ r: string }>("select public.billing_unlock_with_subscription($1, $2, 10) as r", [u, p2])).rows[0].r).toBe("no_subscription");
    });

    it("updates the same subscription on repeated events", async () => {
      const u = await user();
      const sub = `sub_${randomUUID()}`;
      const now = new Date().toISOString();
      await upsert(u, sub, "active", now, now);
      await upsert(u, sub, "past_due", now, now);
      const r = await admin.query("select status from public.subscriptions where provider_subscription_id = $1", [sub]);
      expect(r.rows).toEqual([{ status: "past_due" }]);
    });
  });

  it("transfers a guest's reports to their new permanent account", async () => {
    const guest = await user(true);
    const member = await user(false);
    const p = await project(guest);
    await admin.query("insert into public.user_notes (user_id, research_project_id, content) values ($1, $2, 'n')", [guest, p]);
    const r = await svc<{ n: number }>("select public.transfer_guest_data($1, $2) as n", [guest, member]);
    expect(r.rows[0].n).toBe(1);
    const owner = await admin.query("select user_id from public.research_projects where id = $1", [p]);
    expect(owner.rows[0].user_id).toBe(member);
    const notes = await admin.query("select user_id from public.user_notes where research_project_id = $1", [p]);
    expect(notes.rows[0].user_id).toBe(member);
    expect((await admin.query("select 1 from auth.users where id = $1", [guest])).rowCount).toBe(0);
  });

  it("never transfers from a permanent account", async () => {
    const a = await user(false);
    const b = await user(false);
    await expect(svc("select public.transfer_guest_data($1, $2)", [a, b])).rejects.toThrow(/not a guest/);
  });

  it("grandfathers reports that existed before the paywall", async () => {
    // Migration inserted unlocks for pre-existing projects; new projects start locked.
    const u = await user();
    const p = await project(u);
    expect(await unlocked(p)).toBe(false);
  });
});
