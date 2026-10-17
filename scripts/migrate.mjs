#!/usr/bin/env node
// Applies supabase/migrations/*.sql to Persona Intelligence's OWN Supabase database.
//
// Runs only when PERSONA_MIGRATE_ON_BUILD=true (explicit opt-in, e.g. on Vercel),
// so local builds and CI never touch a database. Safety rails:
//   - the target must be a Supabase database (auth.users exists);
//   - on first run the public schema must be empty, so it can never be pointed at
//     another application's database (override: PERSONA_MIGRATE_ALLOW_NONEMPTY=true);
//   - applied files are tracked (with checksums) in persona_meta.schema_migrations,
//     a schema not exposed through the Supabase API; each file runs in a transaction;
//   - an advisory lock prevents concurrent builds from migrating at the same time.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const env = process.env;
if (env.PERSONA_MIGRATE_ON_BUILD !== "true") {
  console.log("[migrate] skipped (set PERSONA_MIGRATE_ON_BUILD=true to apply database migrations during the build)");
  process.exit(0);
}

const rawUrl = env.PERSONA_DATABASE_URL || env.POSTGRES_URL_NON_POOLING;
if (!rawUrl) {
  console.error("[migrate] PERSONA_MIGRATE_ON_BUILD=true but no PERSONA_DATABASE_URL or POSTGRES_URL_NON_POOLING is set.");
  process.exit(1);
}

const url = new URL(rawUrl);
const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
// pg treats sslmode in the URL as full verification; Supabase's server certificate is
// issued by Supabase's own CA, so we keep TLS encryption and skip CA verification here.
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");
const client = new pg.Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });

const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

try {
  await client.connect();
  await client.query("select pg_advisory_lock(hashtext('persona_intelligence_migrations'))");

  const { rows: supa } = await client.query("select to_regclass('auth.users') as t");
  if (!supa[0].t) throw new Error("Target database has no auth.users table; it does not look like a Supabase database. Aborting.");

  const { rows: meta } = await client.query("select to_regclass('persona_meta.schema_migrations') as t");
  if (!meta[0].t) {
    const { rows: existing } = await client.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    if (existing[0].n > 0 && env.PERSONA_MIGRATE_ALLOW_NONEMPTY !== "true") {
      throw new Error(
        `The public schema already has ${existing[0].n} table(s) and Persona Intelligence has never been installed here. ` +
          "Refusing to migrate a database that may belong to another application. Use a new, dedicated Supabase project.",
      );
    }
    await client.query("create schema if not exists persona_meta");
    await client.query("revoke all on schema persona_meta from public");
    await client.query(
      "create table if not exists persona_meta.schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
    );
  }

  const { rows: applied } = await client.query("select name, checksum from persona_meta.schema_migrations");
  const done = new Map(applied.map((r) => [r.name, r.checksum]));
  let count = 0;
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (done.has(file)) {
      if (done.get(file) !== checksum) console.warn(`[migrate] WARNING: ${file} changed after it was applied; add a new migration instead.`);
      continue;
    }
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into persona_meta.schema_migrations (name, checksum) values ($1, $2)", [file, checksum]);
      await client.query("commit");
      count++;
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file}: ${err.message}`);
    }
  }
  console.log(`[migrate] done (${count} applied, ${files.length - count} already up to date)`);
} catch (err) {
  console.error(`[migrate] FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
