import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Row Level Security tests against a real PostgreSQL database with the
 * migrations applied (see scripts/test-db.sh). Skipped when TEST_DATABASE_URL
 * is not set.
 */

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

let client: Client;

async function asUser<T>(userId: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(userId ? "set local role authenticated" : "set local role anon");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

async function createUser(): Promise<string> {
  const id = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@test.local`]);
  return id;
}

async function createProject(userId: string, name = "Research"): Promise<string> {
  return asUser(userId, async (c) => {
    const { rows } = await c.query(
      "insert into public.research_projects (user_id, name, input) values ($1, $2, $3) returning id",
      [userId, name, JSON.stringify({ fullName: "Test Person" })],
    );
    return rows[0].id as string;
  });
}

async function addSource(userId: string, projectId: string, n = 1): Promise<string> {
  return asUser(userId, async (c) => {
    const { rows } = await c.query(
      `insert into public.sources (user_id, research_project_id, url, normalized_url, domain, source_type, provider)
       values ($1, $2, $3, $4, 'example.com', 'web_page', 'test') returning id`,
      [userId, projectId, `https://example.com/${n}`, `example.com/${n}`],
    );
    return rows[0].id as string;
  });
}

d("row level security", () => {
  let alice: string;
  let bob: string;
  let aliceProject: string;

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    alice = await createUser();
    bob = await createUser();
    aliceProject = await createProject(alice, "Alice research");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("lets owners read their projects and hides them from other users", async () => {
    const own = await asUser(alice, (c) => c.query("select id from public.research_projects where id = $1", [aliceProject]));
    expect(own.rowCount).toBe(1);
    const other = await asUser(bob, (c) => c.query("select id from public.research_projects where id = $1", [aliceProject]));
    expect(other.rowCount).toBe(0);
  });

  it("prevents other users from updating or deleting a project", async () => {
    const upd = await asUser(bob, (c) => c.query("update public.research_projects set name = 'hijacked' where id = $1", [aliceProject]));
    expect(upd.rowCount).toBe(0);
    const del = await asUser(bob, (c) => c.query("delete from public.research_projects where id = $1", [aliceProject]));
    expect(del.rowCount).toBe(0);
    const check = await client.query("select name from public.research_projects where id = $1", [aliceProject]);
    expect(check.rows[0].name).toBe("Alice research");
  });

  it("rejects rows written with another user's id", async () => {
    await expect(
      asUser(bob, (c) =>
        c.query("insert into public.research_projects (user_id, name, input) values ($1, 'x', '{}')", [alice]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects attaching data to another user's project", async () => {
    await expect(addSource(bob, aliceProject)).rejects.toThrow(/row-level security/);
    await expect(
      asUser(bob, (c) =>
        c.query("insert into public.user_notes (user_id, research_project_id, content) values ($1, $2, 'sneaky')", [bob, aliceProject]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(bob, (c) =>
        c.query("insert into public.meeting_briefs (user_id, research_project_id, objective, structured_brief) values ($1, $2, 'x', '{}')", [bob, aliceProject]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects evidence that links to another user's source", async () => {
    const aliceSource = await addSource(alice, aliceProject, 101);
    const bobProject = await createProject(bob);
    const bobClaim = await asUser(bob, async (c) => {
      const { rows } = await c.query(
        `insert into public.claims (user_id, research_project_id, claim_text, category, evidence_type, confidence_label, confidence_rationale, verification_status)
         values ($1, $2, 'c', 'other', 'documented_fact', 'low', 'r', 'single_source') returning id`,
        [bob, bobProject],
      );
      return rows[0].id as string;
    });
    await expect(
      asUser(bob, (c) =>
        c.query(
          `insert into public.claim_evidence (user_id, claim_id, source_id, supporting_excerpt, source_credibility, support_strength)
           values ($1, $2, $3, 'x', 'unknown', 'direct')`,
          [bob, bobClaim, aliceSource],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps private notes private", async () => {
    await asUser(alice, (c) =>
      c.query("insert into public.user_notes (user_id, research_project_id, content) values ($1, $2, 'my private note')", [alice, aliceProject]),
    );
    const visibleToBob = await asUser(bob, (c) => c.query("select content from public.user_notes"));
    expect(visibleToBob.rows.map((r) => r.content)).not.toContain("my private note");
    const visibleToAlice = await asUser(alice, (c) => c.query("select content from public.user_notes"));
    expect(visibleToAlice.rows.map((r) => r.content)).toContain("my private note");
  });

  it("gives the anon role no access", async () => {
    await expect(asUser(null, (c) => c.query("select * from public.research_projects"))).rejects.toThrow(/permission denied/);
  });

  it("makes audit and usage records append-only", async () => {
    await asUser(alice, (c) => c.query("insert into public.audit_events (user_id, event_type) values ($1, 'test.event')", [alice]));
    await expect(asUser(alice, (c) => c.query("update public.audit_events set event_type = 'tampered'"))).rejects.toThrow(/permission denied/);
    await expect(asUser(alice, (c) => c.query("delete from public.usage_events"))).rejects.toThrow(/permission denied/);
    const bobSees = await asUser(bob, (c) => c.query("select * from public.audit_events where user_id = $1", [alice]));
    expect(bobSees.rowCount).toBe(0);
  });

  it("does not let users run the global retention sweep", async () => {
    await expect(asUser(alice, (c) => c.query("select public.purge_expired_research()"))).rejects.toThrow(/permission denied/);
  });

  describe("profile section versioning", () => {
    const save = (userId: string, projectId: string, summary: string) =>
      asUser(userId, (c) =>
        c.query("select * from public.save_profile_sections($1, null, null, $2)", [
          projectId,
          JSON.stringify([{ section_type: "overview", structured_content: { summary }, model_metadata: {} }]),
        ]),
      );

    it("keeps history and preserves user edits when a section is regenerated", async () => {
      const project = await createProject(alice, "Versioning");
      await save(alice, project, "v1");
      await asUser(alice, (c) =>
        c.query("update public.profile_sections set user_override = 'My own wording', user_override_at = now() where research_project_id = $1 and is_current", [project]),
      );
      const second = await save(alice, project, "v2");
      expect(second.rows[0].version).toBe(2);
      expect(second.rows[0].user_override).toBe("My own wording");
      const all = await asUser(alice, (c) =>
        c.query("select version, is_current, structured_content->>'summary' as summary from public.profile_sections where research_project_id = $1 order by version", [project]),
      );
      expect(all.rows).toEqual([
        { version: 1, is_current: false, summary: "v1" },
        { version: 2, is_current: true, summary: "v2" },
      ]);
    });

    it("refuses to write sections into another user's project", async () => {
      await expect(save(bob, aliceProject, "hijack")).rejects.toThrow(/project not found/);
    });
  });

  it("cascades project deletion to all derived data", async () => {
    const project = await createProject(alice, "To delete");
    const source = await addSource(alice, project, 202);
    await asUser(alice, async (c) => {
      const { rows } = await c.query(
        `insert into public.claims (user_id, research_project_id, claim_text, category, evidence_type, confidence_label, confidence_rationale, verification_status)
         values ($1, $2, 'c', 'other', 'documented_fact', 'low', 'r', 'single_source') returning id`,
        [alice, project],
      );
      await c.query(
        `insert into public.claim_evidence (user_id, claim_id, source_id, supporting_excerpt, source_credibility, support_strength) values ($1, $2, $3, 'x', 'unknown', 'direct')`,
        [alice, rows[0].id, source],
      );
      await c.query("insert into public.user_notes (user_id, research_project_id, content) values ($1, $2, 'n')", [alice, project]);
      await c.query("insert into public.meeting_briefs (user_id, research_project_id, objective, structured_brief) values ($1, $2, 'x', '{}')", [alice, project]);
    });
    await asUser(alice, (c) => c.query("delete from public.research_projects where id = $1", [project]));
    for (const table of ["sources", "claims", "user_notes", "meeting_briefs"]) {
      const { rowCount } = await client.query(`select 1 from public.${table} where research_project_id = $1`, [project]);
      expect(rowCount, table).toBe(0);
    }
    const { rowCount } = await client.query("select 1 from public.claim_evidence where source_id = $1", [source]);
    expect(rowCount).toBe(0);
  });

  it("applies the caller's retention window only to their own projects", async () => {
    const carol = await createUser();
    const old = await createProject(carol, "Old");
    const fresh = await createProject(carol, "Fresh");
    const bobOld = await createProject(bob, "Bob old");
    await client.query("alter table public.research_projects disable trigger research_projects_updated_at");
    await client.query("update public.research_projects set updated_at = now() - interval '400 days' where id = any($1)", [[old, bobOld]]);
    await client.query("alter table public.research_projects enable trigger research_projects_updated_at");
    const deleted = await asUser(carol, (c) => c.query("select public.apply_my_retention() as n"));
    expect(deleted.rows[0].n).toBe(1);
    const remaining = await client.query("select id from public.research_projects where id = any($1)", [[old, fresh, bobOld]]);
    expect(remaining.rows.map((r) => r.id).sort()).toEqual([fresh, bobOld].sort());
  });

  it("deletes an account and all of its data, leaving other users intact", async () => {
    const dave = await createUser();
    const project = await createProject(dave, "Dave");
    await addSource(dave, project, 303);
    const bobBefore = await client.query("select count(*)::int as n from public.research_projects where user_id = $1", [bob]);
    await asUser(dave, (c) => c.query("select public.delete_my_account()"));
    const users = await client.query("select 1 from auth.users where id = $1", [dave]);
    expect(users.rowCount).toBe(0);
    for (const table of ["research_projects", "sources"]) {
      const { rowCount } = await client.query(`select 1 from public.${table} where user_id = $1`, [dave]);
      expect(rowCount, table).toBe(0);
    }
    const bobAfter = await client.query("select count(*)::int as n from public.research_projects where user_id = $1", [bob]);
    expect(bobAfter.rows[0].n).toBe(bobBefore.rows[0].n);
  });

  it("does not let anonymous callers delete accounts", async () => {
    await expect(asUser(null, (c) => c.query("select public.delete_my_account()"))).rejects.toThrow();
  });
});
