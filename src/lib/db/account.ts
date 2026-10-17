import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables included in a user's data export, in dependency order. */
export const EXPORT_TABLES = [
  "user_settings",
  "research_projects",
  "persons",
  "person_identifiers",
  "research_jobs",
  "sources",
  "claims",
  "claim_evidence",
  "profile_sections",
  "meeting_briefs",
  "user_notes",
  "usage_events",
  "audit_events",
] as const;

/**
 * Collects every row the signed-in user owns. RLS restricts each query to
 * the caller's rows, so this cannot include another user's data.
 */
export async function exportUserData(db: SupabaseClient, user: { id: string; email?: string | null }) {
  const tables: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select("*").range(from, from + 999);
      if (error) throw new Error(`Export failed for ${table}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    tables[table] = rows;
  }
  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null },
    note: "Public-source research data and your private notes. Sources are third-party public content; private notes are your own.",
    tables,
  };
}
