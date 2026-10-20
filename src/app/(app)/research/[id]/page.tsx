import { CalendarClock, Download, FileText, History, Lock, Printer, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/site-chrome";
import { LockedCards, PreviewView } from "@/components/paywall/preview-view";
import { DeleteButton, NotesPanel, RefreshResearchButton } from "@/components/profile/actions";
import { ProfileSearchBox, ProfileTabContent, ProfileTabs, ResearchDisclaimer } from "@/components/profile/profile-view";
import { IdentityChooser } from "@/components/research/identity-chooser";
import { JobProgress } from "@/components/research/job-progress";
import { QualitySummary } from "@/components/research/quality-summary";
import { SourceCoverage } from "@/components/research/source-coverage";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, Notice } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { getReportAccess } from "@/lib/billing/entitlements";
import { buildPreview, type LockedKey } from "@/lib/billing/preview";
import { getAccessConfig, getPublicConfig } from "@/lib/config";
import { loadProjectBundle } from "@/lib/db/queries";
import { JOB_STATUS_DISPLAY } from "@/lib/research/status-display";
import { PROFILE_TAB_IDS } from "@/lib/research/tabs";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.research };
}

const IDENTITY_TONES: Record<string, "high" | "accent" | "moderate"> = {
  user_confirmed: "high",
  matched_by_identifiers: "accent",
  unconfirmed: "moderate",
  ambiguous: "moderate",
};

/** Tabs of a locked report that map to a locked card instead of content. */
const LOCKED_TAB_CARD: Partial<Record<string, LockedKey>> = {
  background: "background",
  interests: "interests",
  communication: "communication",
  values: "values",
  relationships: "relationships",
  recent: "recent",
  open_questions: "open_questions",
  evidence: "evidence",
  sources: "sources",
};

export default async function ResearchPage({ params, searchParams }: PageProps<"/research/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}`);
  const { t, locale } = await getI18n();
  const [bundle, access] = await Promise.all([loadProjectBundle(supabase, id), getReportAccess(supabase, id)]);
  if (!bundle) notFound();
  const cfg = getPublicConfig();
  const sp = await searchParams;
  const full = access.full;

  const job = bundle.latestJob;
  const jobActive = job && ["queued", "running", "needs_input"].includes(job.status);
  const validTabs: string[] = ["workspace", "notes", ...PROFILE_TAB_IDS];
  const requested = typeof sp.tab === "string" ? sp.tab : null;
  const hasProfile = bundle.sections.length > 0;
  const tab = requested && validTabs.includes(requested) ? requested : jobActive || !hasProfile ? "workspace" : "overview";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : undefined;
  const base = `/research/${id}`;
  const unlockHref = `${base}/unlock`;
  const quality = bundle.jobs.find((j) => j.qualityReport)?.qualityReport ?? null;
  const identityStatus = bundle.person?.identityStatus;
  const status = bundle.project.status;
  const personName = bundle.person?.displayName ?? bundle.project.input.fullName;

  // Built on the server: a locked report never sends more than this to the browser.
  const preview = full
    ? null
    : buildPreview(
        { sections: bundle.sections, claims: bundle.claims, sources: bundle.sources, quality },
        { findings: getAccessConfig().previewFindings, keyPoints: getAccessConfig().previewKeyPoints },
      );

  const renderTab = () => {
    if (tab === "notes") {
      return (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">{t.project.notesTitle}</h2>
          <NotesPanel projectId={id} notes={bundle.notes} />
        </Card>
      );
    }
    if (preview) {
      if (tab === "overview") return <PreviewView preview={preview} unlockHref={unlockHref} personName={personName} />;
      const only = LOCKED_TAB_CARD[tab];
      return <LockedCards locked={preview.locked} unlockHref={unlockHref} personName={personName} only={only} />;
    }
    return (
      <ProfileTabContent
        tab={tab}
        query={q}
        data={{ sections: bundle.sections, claims: bundle.claims, sources: bundle.sources, quality }}
        editable={{ projectId: id, aiConfigured: cfg.analysisConfigured }}
      />
    );
  };

  return (
    <PageContainer width="wide" className="space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={JOB_STATUS_DISPLAY[status].tone}>{t.jobStatus[status]}</Badge>
            {identityStatus && IDENTITY_TONES[identityStatus] && (
              <Badge tone={IDENTITY_TONES[identityStatus]}>{t.project.identity[identityStatus as keyof typeof t.project.identity]}</Badge>
            )}
            {!full && <Badge tone="accent">{t.paywall.previewBadge}</Badge>}
          </div>
          <h1 className="break-words text-[30px] font-semibold leading-tight sm:text-[34px]">
            <bdi>{personName}</bdi>
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <bdi>{[bundle.project.input.company, bundle.project.input.role, bundle.project.input.location].filter(Boolean).join(" · ") || t.project.nameOnly}</bdi>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden /> {t.project.lastResearched(formatDateTime(bundle.project.lastResearchedAt, locale))}
            </span>
          </p>
          {job?.identity.selected && (
            <p className="text-[13px] text-muted">
              {t.project.researching(job.identity.selected.label)}
            </p>
          )}
        </div>
        <div className="no-print flex w-full flex-col items-stretch gap-3 sm:w-auto sm:items-end">
          {full && <ProfileSearchBox base={base} defaultValue={q} />}
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {full ? (
              <>
                <LinkButton href={`${base}/meeting`} size="sm" variant="primary">
                  <Sparkles aria-hidden /> {t.project.meetingPrep}
                </LinkButton>
                <LinkButton href={`${base}/report`} size="sm" variant="secondary">
                  <Printer aria-hidden /> {t.report.printPreview}
                </LinkButton>
              </>
            ) : (
              <LinkButton href={unlockHref} size="sm" variant="accent">
                <Lock aria-hidden /> {t.paywall.unlockCta}
              </LinkButton>
            )}
            {full && <RefreshResearchButton projectId={id} disabled={Boolean(jobActive) || !cfg.searchConfigured || !job?.identity.selected} />}
          </div>
        </div>
      </header>

      {status === "partial" && (
        <Notice tone="warning" title={t.project.partialTitle}>
          {t.project.partialBody}
        </Notice>
      )}

      <ProfileTabs
        base={base}
        active={tab}
        locked={!full}
        extraTabs={[
          { id: "workspace", label: t.project.workspaceTab },
          { id: "notes", label: t.project.notesTab(bundle.notes.length) },
        ]}
      />

      {tab === "workspace" ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="min-w-0 space-y-6">
            {job?.status === "needs_input" && job.identity.candidates?.length ? (
              <Card className="p-5">
                <IdentityChooser projectId={id} identity={job.identity} />
              </Card>
            ) : null}
            <Card>
              <CardHeader
                title={t.workspace.progressTitle}
                description={job ? t.workspace.started(formatDateTime(job.startedAt ?? job.createdAt, locale), job.kind === "refresh") : undefined}
              />
              <div className="p-5">
                {job ? (
                  <JobProgress
                    projectId={id}
                    initial={{ id: job.id, status: job.status, currentStage: job.currentStage, progress: job.progress, errorDetails: job.errorDetails, stalled: false }}
                  />
                ) : (
                  <p className="text-sm text-muted">{t.workspace.noJob}</p>
                )}
              </div>
            </Card>
          </div>
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title={t.workspace.atAGlance} />
              <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
                <div>
                  <dt className="text-muted">{t.workspace.sourcesDiscovered}</dt>
                  <dd className="font-display text-2xl">{bundle.sources.length}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.workspace.verifiedClaims}</dt>
                  <dd className="font-display text-2xl">{bundle.claims.length}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.workspace.conflictingClaims}</dt>
                  <dd className="font-display text-2xl">{bundle.claims.filter((c) => c.conflictGroup).length}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t.workspace.aiAnalysis}</dt>
                  <dd className="text-[15px]">
                    {cfg.analysisConfigured
                      ? hasProfile
                        ? t.workspace.aiComplete
                        : job && ["queued", "running"].includes(job.status)
                          ? t.workspace.aiPending
                          : t.workspace.aiNotGenerated
                      : t.workspace.aiNotConfigured}
                  </dd>
                </div>
              </dl>
              {hasProfile && (
                <div className="border-t border-line px-5 py-3">
                  <Link href={`${base}?tab=overview`} className="text-sm font-medium text-accent hover:underline">
                    {t.workspace.openReport} <span className="rtl:hidden">→</span>
                    <span className="hidden rtl:inline">←</span>
                  </Link>
                </div>
              )}
            </Card>
            {quality?.categories && quality.categories.length > 0 && (
              <Card>
                <CardHeader title={t.coverage.title} description={t.coverage.body} />
                <div className="p-5">
                  <SourceCoverage categories={quality.categories} providers={quality.providers ?? []} />
                </div>
              </Card>
            )}
            {quality && full && (
              <Card>
                <CardHeader title={t.sections.qualityTitle} />
                <div className="p-5">
                  <QualitySummary quality={quality} showCoverage={false} />
                </div>
              </Card>
            )}
            {bundle.jobs.length > 1 && (
              <Card>
                <CardHeader title={t.workspace.runs} />
                <ul className="divide-y divide-line text-sm">
                  {bundle.jobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span>
                        {j.kind === "refresh" ? t.workspace.refreshRun : t.workspace.initialRun} · {formatDateTime(j.createdAt, locale)}
                      </span>
                      <Badge tone={JOB_STATUS_DISPLAY[j.status].tone}>{t.jobStatus[j.status]}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      ) : (
        renderTab()
      )}

      <ResearchDisclaimer />

      <Card className="no-print">
        <CardHeader title={t.project.exportTitle} />
        <div className="flex flex-wrap items-center gap-2 p-5">
          {full ? (
            <>
              <LinkButton href={`${base}/report`} size="sm" variant="secondary">
                <Printer aria-hidden /> {t.project.printReport}
              </LinkButton>
              <LinkButton href={`/api/research/${id}/export?part=profile`} size="sm" variant="secondary" prefetch={false}>
                <Download aria-hidden /> {t.project.exportProfile}
              </LinkButton>
              <LinkButton href={`/api/research/${id}/export?part=report`} size="sm" variant="secondary" prefetch={false}>
                <FileText aria-hidden /> {t.project.exportReport}
              </LinkButton>
              <LinkButton href={`/api/research/${id}/export?part=bibliography`} size="sm" variant="secondary" prefetch={false}>
                <Download aria-hidden /> {t.project.exportBibliography}
              </LinkButton>
              <LinkButton href={`${base}/history`} size="sm" variant="ghost">
                <History aria-hidden /> {t.project.history}
              </LinkButton>
            </>
          ) : (
            <LinkButton href={unlockHref} size="sm" variant="secondary">
              <Lock aria-hidden /> {t.paywall.unlockCta}
            </LinkButton>
          )}
          <div className="ms-auto">
            <DeleteButton url={`/api/research/${id}`} redirectTo="/dashboard" label={t.project.deleteProject} confirmText={t.project.deleteConfirm} />
          </div>
        </div>
        <p className="px-5 pb-4 text-[12.5px] text-muted">{t.project.exportNote(formatDate(bundle.project.createdAt, locale))}</p>
      </Card>
    </PageContainer>
  );
}
