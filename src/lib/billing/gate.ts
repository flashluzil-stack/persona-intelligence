import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getReportAccess } from "./entitlements";

/** Page-level paywall gate: premium report pages redirect to the unlock page. */
export async function requireUnlockedReport(db: SupabaseClient, projectId: string): Promise<void> {
  const access = await getReportAccess(db, projectId);
  if (!access.full) redirect(`/research/${projectId}/unlock`);
}
