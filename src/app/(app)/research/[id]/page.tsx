import { CalendarClock, Download, FileText, History, Printer, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/site-chrome";
import { DeleteButton, NotesPanel, RefreshResearchButton } from "@/components/profile/actions";
import { PROFILE_TABS, ProfileSearchBox, ProfileTabContent, ProfileTabs, ResearchDisclaimer } from "@/components/profile/profile-view";
import { IdentityChooser } from "@/components/research/identity-chooser";
import { JobProgress } from "@/components/research/job-progress";
import { JOB_STATUS_DISPLAY } from "@/lib/research/status-display";
import { QualitySummary } from "@/components/research/quality-summary";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, Notice } from "@/components/ui/primitives";
import { requireAuth } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { loadProjectBundle } from "@/lib/db/queries";
import { uuidSchema } from "@/lib/validation/schemas";
import { formatDate, formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Research" };

const IDENTITY_LABELS: Record<string, { label: string; tone: "high" | "accent" | "moderate" }> = {
  user_confirmed: { label: "Identity confirmed by you", tone: "high" },
  matched_by_identifiers: { label: "Matched by your identifiers", tone: "accent" },
  unconfirmed: { label: "Identity unconfirmed", tone: "moderate" },
  ambiguous: { label: "Identity ambiguous", tone: "moderate" },
};

export default async function ResearchPage({ params, searchParams }: PageProps<"/research/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}`);
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  const cfg = getPublicConfig();
  const sp = await searchParams;

  const job = bundle.latestJob;
  const jobActive = job && ["queued", "running", "needs_input"].includes(job.status);
  const validTabs = ["workspace", "notes", ...PROFILE_TABS.map((t) => t.id)];
  const requested = typeof sp.tab === "string" ? sp.tab : null;
  const hasProfile = bundle.sections.length > 0;
  const tab = requested && validTabs.includes(requested) ? requested : jobActive || !hasProfile ? "workspace" : "overview";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : undefined;
  const base = `/research/${id}`;
  const quality = bundle.jobs.find((j) => j.qualityReport)?.qualityReport ?? null;
  const identity = bundle.person ? IDENTITY_LABELS[bundle.person.identityStatus] : null;
  const status = JOB_STATUS_DISPLAY[bundle.project.status];

  return (
    <PageContainer width="wide" className="space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {identity && <Badge tone={identity.tone}>{identity.label}</Badge>}
          </div>
          <h1 className="text-[34px] font-semibold leading-tight">{bundle.person?.displayName ?? bundle.project.input.fullName}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{[bundle.project.input.company, bundle.project.input.role, bundle.project.input.location].filter(Boolean).join(" · ") || "Name only"}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden /> Last researched {bundle.project.lastResearchedAt ? formatDateTime(bundle.project.lastResearchedAt) : "—"}
            </span>
          </p>
          {job?.identity.selected && <p className="text-[13px] text-muted">Researching: {job.identity.selected.label}</p>}
        </div>
        <div className="no-print flex flex-col items-end gap-3">
          <ProfileSearchBox base={base} defaultValue={q} />
          <div className="flex flex-wrap justify-end gap-2">
            <LinkButton href={`${base}/meeting`} size="sm" variant="primary">
              <Sparkles aria-hidden /> Meeting preparation
            </LinkButton>
            <RefreshResearchButton projectId={id} disabled={Boolean(jobActive) || !cfg.searchConfigured || !job?.identity.selected} />
          </div>
        </div>
      </header>

      {bundle.project.status === "partial" && (
        <Notice tone="warning" title="Partial results">
          Some stages did not complete. Everything found so far is saved. See the research quality and workspace tabs for details.
        </Notice>
      )}

      <ProfileTabs
        base={base}
        active={tab}
        extraTabs={[
          { id: "workspace", label: "Workspace" },
          { id: "notes", label: `My notes${bundle.notes.length ? ` (${bundle.notes.length})` : ""}` },
        ]}
      />

      {tab === "workspace" ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            {job?.status === "needs_input" && job.identity.candidates?.length ? (
              <Card className="p-5">
                <IdentityChooser projectId={id} identity={job.identity} />
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Research progress" description={job ? `Started ${formatDateTime(job.startedAt ?? job.createdAt)} · ${job.kind === "refresh" ? "Refresh run" : "Initial run"}` : undefined} />
              <div className="p-5">
                {job ? (
                  <JobProgress
                    projectId={id}
                    initial={{ id: job.id, status: job.status, currentStage: job.currentStage, progress: job.progress, errorDetails: job.errorDetails, stalled: false }}
                  />
                ) : (
                  <p className="text-sm text-muted">No research job found.</p>
                )}
              </div>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="At a glance" />
              <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
                <div>
                  <dt className="text-muted">Sources discovered</dt>
                  <dd className="font-display text-2xl">{bundle.sources.length}</dd>
                </div>
                <div>
                  <dt className="text-muted">Verified claims</dt>
                  <dd className="font-display text-2xl">{bundle.claims.length}</dd>
                </div>
                <div>
                  <dt className="text-muted">Conflicting claims</dt>
                  <dd className="font-display text-2xl">{bundle.claims.filter((c) => c.conflictGroup).length}</dd>
                </div>
                <div>
                  <dt className="text-muted">AI analysis</dt>
                  <dd className="text-[15px]">{cfg.analysisConfigured ? (bundle.sections.length ? "Complete" : job && ["queued", "running"].includes(job.status) ? "Pending" : "Not generated") : "Not configured"}</dd>
                </div>
              </dl>
              {hasProfile && (
                <div className="border-t border-line px-5 py-3">
                  <Link href={`${base}?tab=overview`} className="text-sm font-medium text-accent hover:underline">
                    Open the profile →
                  </Link>
                </div>
              )}
            </Card>
            {quality && (
              <Card>
                <CardHeader title="Research quality" />
                <div className="p-5">
                  <QualitySummary quality={quality} />
                </div>
              </Card>
            )}
            {bundle.jobs.length > 1 && (
              <Card>
                <CardHeader title="Research runs" />
                <ul className="divide-y divide-line text-sm">
                  {bundle.jobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between px-5 py-2.5">
                      <span>
                        {j.kind === "refresh" ? "Refresh" : "Initial"} · {formatDateTime(j.createdAt)}
                      </span>
                      <Badge tone={JOB_STATUS_DISPLAY[j.status].tone}>{JOB_STATUS_DISPLAY[j.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      ) : tab === "notes" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">My private notes</h2>
          <NotesPanel projectId={id} notes={bundle.notes} />
        </Card>
      ) : (
        <ProfileTabContent
          tab={tab}
          query={q}
          data={{ sections: bundle.sections, claims: bundle.claims, sources: bundle.sources, quality }}
          editable={{ projectId: id, aiConfigured: cfg.analysisConfigured }}
        />
      )}

      <ResearchDisclaimer />

      <Card className="no-print">
        <CardHeader title="Export, history & data" />
        <div className="flex flex-wrap items-center gap-2 p-5">
          <LinkButton href={`${base}/report`} size="sm" variant="secondary">
            <Printer aria-hidden /> Print-friendly report
          </LinkButton>
          <LinkButton href={`/api/research/${id}/export?part=profile`} size="sm" variant="secondary" prefetch={false}>
            <Download aria-hidden /> Profile summary (.md)
          </LinkButton>
          <LinkButton href={`/api/research/${id}/export?part=report`} size="sm" variant="secondary" prefetch={false}>
            <FileText aria-hidden /> Research report (.md)
          </LinkButton>
          <LinkButton href={`/api/research/${id}/export?part=bibliography`} size="sm" variant="secondary" prefetch={false}>
            <Download aria-hidden /> Bibliography (.md)
          </LinkButton>
          <LinkButton href={`${base}/history`} size="sm" variant="ghost">
            <History aria-hidden /> Version history
          </LinkButton>
          <div className="ms-auto">
            <DeleteButton
              url={`/api/research/${id}`}
              redirectTo="/dashboard"
              label="Delete project"
              confirmText="Permanently delete this research project, including its sources, profile, meeting briefs and private notes?"
            />
          </div>
        </div>
        <p className="px-5 pb-4 text-[12.5px] text-muted">
          Exports include source links, access dates and confidence labels. Private notes are left out unless you add them from the print-friendly report. Created {formatDate(bundle.project.createdAt)}.
        </p>
      </Card>
    </PageContainer>
  );
}
