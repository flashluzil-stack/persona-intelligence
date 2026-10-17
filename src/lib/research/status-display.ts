import type { JobStatus } from "./types";

/** Display labels for job/project statuses. Shared by server and client components. */
export const JOB_STATUS_DISPLAY: Record<JobStatus, { label: string; tone: "neutral" | "accent" | "moderate" | "danger" | "high" }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  needs_input: { label: "Needs your input", tone: "moderate" },
  completed: { label: "Completed", tone: "high" },
  partial: { label: "Partially completed", tone: "moderate" },
  failed: { label: "Failed", tone: "danger" },
};
