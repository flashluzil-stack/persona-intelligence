import type { Messages } from "@/i18n/messages";
import type { JobError } from "./store";
import type { JobStatus } from "./types";

/** Display labels for job/project statuses. Shared by server and client components. */
/** Badge tones per status; labels come from the dictionaries (t.jobStatus). */
export const JOB_STATUS_DISPLAY: Record<JobStatus, { tone: "neutral" | "accent" | "moderate" | "danger" | "high" }> = {
  queued: { tone: "neutral" },
  running: { tone: "accent" },
  needs_input: { tone: "moderate" },
  completed: { tone: "high" },
  partial: { tone: "moderate" },
  failed: { tone: "danger" },
};

/** Known failure codes are shown in the viewer's language; others fall back to the stored text. */
export function localizedJobError(err: JobError, t: Messages): string {
  const map: Record<string, string> = {
    stalled: t.engine.stalled,
    timeout: t.engine.timeout,
    unexpected: t.engine.unexpected,
    search_not_configured: t.engine.searchNotConfigured,
    no_results: t.engine.noResults,
    no_match: t.engine.noMatch,
    identity_rejected: t.errors.identityRejected,
    ai_budget: t.engine.aiBudget,
    invalid_input: t.engine.invalidInput,
  };
  return map[err.code] ?? err.message;
}

