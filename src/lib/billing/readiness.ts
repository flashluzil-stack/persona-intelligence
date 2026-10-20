import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mirrors billing_report_ready() for the user's own client (RLS applies):
 * a report is billable only with a current overview AND at least one
 * verified finding. Empty or failed reports are never charged.
 */
export async function isReportBillable(db: SupabaseClient, projectId: string): Promise<boolean> {
  const [{ data: overview }, { count }] = await Promise.all([
    db.from("profile_sections").select("id").eq("research_project_id", projectId).eq("section_type", "overview").eq("is_current", true).maybeSingle(),
    db.from("claims").select("id", { count: "exact", head: true }).eq("research_project_id", projectId),
  ]);
  return Boolean(overview) && (count ?? 0) > 0;
}
