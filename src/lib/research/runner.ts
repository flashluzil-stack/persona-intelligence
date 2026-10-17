import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { getPublicConfig, getResearchLimits } from "@/lib/config";
import { SupabaseResearchStore } from "@/lib/db/supabase-store";
import { createAnalysisModel } from "@/lib/providers/analysis";
import { safeFetch } from "@/lib/providers/content/safe-fetch";
import { WebContentProvider } from "@/lib/providers/content/web-content-provider";
import { createSearchProvider } from "@/lib/providers/search";
import { createUserScopedClient } from "@/lib/supabase/server";
import { runResearchJob, type PipelineDeps } from "./pipeline";

export function buildPipelineDeps(db: SupabaseClient, userId: string): PipelineDeps {
  const limits = getResearchLimits();
  return {
    store: new SupabaseResearchStore(db, userId),
    search: createSearchProvider(),
    content: getPublicConfig().pageRetrievalEnabled
      ? new WebContentProvider(safeFetch, { maxBytes: limits.maxPageBytes, maxChars: limits.maxContentChars })
      : null,
    model: createAnalysisModel(),
    limits,
  };
}

/**
 * Runs a research job after the HTTP response has been sent, using the
 * user's access token so RLS applies. The job persists progress after every
 * stage; if the process is recycled mid-run, the workspace offers "Resume",
 * which calls this again (the pipeline is idempotent per stage).
 *
 * For high-volume production use, swap this for a durable queue
 * (e.g. Supabase Queues, Inngest, or a worker) behind the same function.
 */
export function scheduleResearchJob(jobId: string, accessToken: string, userId: string): void {
  after(async () => {
    try {
      const db = createUserScopedClient(accessToken);
      await runResearchJob(jobId, buildPipelineDeps(db, userId));
    } catch (err) {
      console.error("[research] job crashed", jobId, err instanceof Error ? err.message : "unknown");
    }
  });
}
