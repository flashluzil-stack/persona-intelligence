"use client";

import { CheckCircle2, Circle, CircleAlert, CircleDashed, CircleMinus, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import { JOB_STATUS_DISPLAY, localizedJobError } from "@/lib/research/status-display";
import type { JobError } from "@/lib/research/store";
import { RESEARCH_STAGES, type JobStatus, type ResearchStage, type StageLogEntry } from "@/lib/research/types";
import { apiRequest } from "@/lib/utils/client-api";

interface StatusPayload {
  id: string;
  status: JobStatus;
  currentStage: ResearchStage | null;
  progress: StageLogEntry[];
  errorDetails: JobError | null;
  stalled: boolean;
}

function stageState(stage: ResearchStage, progress: StageLogEntry[], current: ResearchStage | null, active: boolean) {
  const last = progress.filter((p) => p.stage === stage).at(-1);
  if (!last) return { icon: Circle, cls: "text-line-strong", message: null as string | null };
  if (last.status === "error") return { icon: XCircle, cls: "text-danger", message: last.message };
  if (last.status === "warning") return { icon: CircleAlert, cls: "text-moderate", message: last.message };
  if (last.status === "skipped") return { icon: CircleMinus, cls: "text-faint", message: last.message };
  if (last.status === "running" && active && current === stage) return { icon: Loader2, cls: "animate-spin text-accent", message: last.message };
  if (last.status === "running") return { icon: CircleDashed, cls: "text-faint", message: last.message };
  return { icon: CheckCircle2, cls: "text-high", message: last.message };
}

/** Live research status. Polls a lightweight endpoint while the job is active. */
export function JobProgress({ projectId, initial }: { projectId: string; initial: StatusPayload }) {
  const { t } = useI18n();
  const w = t.workspace;
  const router = useRouter();
  const [status, setStatus] = useState<StatusPayload>(initial);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const lastStatus = useRef(initial.status);
  const active = status.status === "queued" || status.status === "running";

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      const res = await apiRequest<StatusPayload>(`/api/research/${projectId}/status`, "GET");
      if (cancelled || !res.data) return;
      setStatus(res.data);
      if (res.data.status !== lastStatus.current) {
        lastStatus.current = res.data.status;
        if (!["queued", "running"].includes(res.data.status)) router.refresh();
      }
    };
    const id = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, projectId, router]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={JOB_STATUS_DISPLAY[status.status].tone} className="text-[12.5px]">
          {active && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {t.jobStatus[status.status]}
        </Badge>
        {active && <p className="text-sm text-muted">{w.canLeave}</p>}
      </div>

      {status.stalled && (
        <Notice tone="warning" title={w.stalledTitle}>
          <p>{w.stalledBody}</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={async () => {
              setResumeError(null);
              const res = await apiRequest(`/api/research/${projectId}/resume`, "POST");
              if (!res.ok) setResumeError(res.error);
              else router.refresh();
            }}
          >
            {w.resume}
          </Button>
          {resumeError && <p className="mt-1 text-danger">{resumeError}</p>}
        </Notice>
      )}

      {status.errorDetails && (
        <Notice tone={status.status === "partial" ? "warning" : "danger"} title={status.status === "partial" ? w.partialTitle : w.failedTitle} role="alert">
          {localizedJobError(status.errorDetails, t)}
        </Notice>
      )}

      <ol className="divide-y divide-line rounded-md border border-line bg-paper-raised" aria-label={w.stagesAria}>
        {RESEARCH_STAGES.filter((s) => s !== "meeting_brief").map((stage) => {
          const s = stageState(stage, status.progress, status.currentStage, active);
          const Icon = s.icon;
          return (
            <li key={stage} className="flex gap-3 px-4 py-2.5">
              <Icon className={`mt-0.5 size-4 shrink-0 ${s.cls}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">{t.stages[stage]}</p>
                {s.message && <p dir="auto" className="text-[13px] text-muted">{s.message}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
