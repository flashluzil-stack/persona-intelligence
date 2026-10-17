import { AlertTriangle, ArrowRight, Coins, FileText, History, Lock, Repeat, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { ResearchForm } from "@/components/research/research-form";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Notice } from "@/components/ui/primitives";
import { formatDate, relativeTime } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { getEntitlements, getUnlockedSet } from "@/lib/billing/entitlements";
import { getPublicConfig } from "@/lib/config";
import { listProjects, listRecentBriefs } from "@/lib/db/queries";
import { objectiveLabel } from "@/lib/export/markdown";
import { checkResearchQuota } from "@/lib/research/quota";
import { JOB_STATUS_DISPLAY, localizedJobError } from "@/lib/research/status-display";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dashboard.title };
}

export default async function DashboardPage() {
  const { supabase, user } = await requireAuth("/dashboard");
  const { t, locale } = await getI18n();
  const d = t.dashboard;
  const cfg = getPublicConfig();
  const guest = Boolean(user.is_anonymous);

  // Housekeeping: ensure settings row and apply retention. (checkResearchQuota releases stalled jobs.)
  await supabase.from("user_settings").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  await supabase.rpc("apply_my_retention");

  const [quota, projects, briefs, settingsRes, entitlements] = await Promise.all([
    checkResearchQuota(supabase, user, t),
    listProjects(supabase),
    listRecentBriefs(supabase),
    supabase.from("user_settings").select("research_preferences").eq("user_id", user.id).maybeSingle(),
    cfg.paywallEnforced ? getEntitlements(supabase) : Promise.resolve(null),
  ]);
  const unlocked = await getUnlockedSet(supabase, projects.map((p) => p.id));
  const confirmBeforeRun = (settingsRes.data?.research_preferences as { confirmBeforeResearch?: boolean } | null)?.confirmBeforeResearch ?? true;
  const active = projects.filter((p) => p.latestJob && ["queued", "running", "needs_input"].includes(p.latestJob.status));
  const saved = projects.filter((p) => ["completed", "partial"].includes(p.status));
  const sub = entitlements?.subscription ?? null;

  const AccessBadge = ({ id }: { id: string }) =>
    cfg.paywallEnforced ? (
      unlocked.has(id) ? (
        <Badge tone="high">{d.fullAccess}</Badge>
      ) : (
        <Badge tone="neutral">
          <Lock className="size-3" aria-hidden /> {d.previewOnly}
        </Badge>
      )
    ) : null;

  return (
    <PageContainer width="wide" className="space-y-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">{d.title}</h1>
          <p className="text-sm text-muted">
            {d.runsUsed(quota.usedToday, quota.dailyLimit)}
            {quota.freeRemaining !== null && <> · {d.freeLeft(quota.freeRemaining)}</>}
          </p>
        </div>
        <LinkButton href="#research" variant="primary">
          <Search aria-hidden /> {d.researchPerson}
        </LinkButton>
      </header>

      {guest && (
        <Notice tone="info" title={d.guestTitle}>
          {d.guestBody}{" "}
          <Link href="/sign-up?next=/dashboard" className="font-medium underline">
            {t.nav.createAccount}
          </Link>{" "}
          ·{" "}
          <Link href="/sign-in?next=/dashboard" className="font-medium underline">
            {t.nav.signIn}
          </Link>
        </Notice>
      )}
      {!cfg.searchConfigured && (
        <Notice tone="demo" title={d.demoTitle}>
          {d.demoBody} <Link href="/demo">{t.nav.sample}</Link>
        </Notice>
      )}
      {cfg.searchConfigured && !cfg.analysisConfigured && (
        <Notice tone="warning" title={d.aiMissingTitle}>
          {d.aiMissingBody}
        </Notice>
      )}

      {entitlements && !guest && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex items-start gap-3 p-5">
            <Coins className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-muted">{t.billingPanel.credits}</p>
              <p className="font-display text-2xl">{t.billingPanel.creditsBalance(entitlements.credits)}</p>
              <Link href={cfg.paymentsConfigured ? "/pricing" : "/settings#billing"} className="text-sm text-accent hover:underline">
                {t.billingPanel.buyCredits}
              </Link>
            </div>
          </Card>
          <Card className="flex items-start gap-3 p-5">
            <Repeat className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-muted">{t.billingPanel.subscription}</p>
              {sub ? (
                <>
                  <p className="text-[15px] font-medium">
                    {t.pricing.products[sub.productKey === "annual" ? "annual" : "monthly"].name} · {t.billingPanel.status[sub.status]}
                  </p>
                  <p className="text-[13px] text-muted">
                    {sub.cancelAtPeriodEnd || sub.status === "canceled"
                      ? t.billingPanel.endsOn(formatDate(sub.currentPeriodEnd, locale))
                      : t.billingPanel.renewsOn(formatDate(sub.currentPeriodEnd, locale))}
                    {sub.grantsAccess && <> · {t.billingPanel.fairUse(sub.usedThisPeriod, sub.periodLimit)}</>}
                  </p>
                  <Link href="/settings#billing" className="text-sm text-accent hover:underline">
                    {t.billingPanel.manage}
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-[15px]">{t.billingPanel.noSubscription}</p>
                  <Link href="/pricing" className="text-sm text-accent hover:underline">
                    {t.billingPanel.plans}
                  </Link>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {active.length > 0 && (
        <Card>
          <CardHeader title={d.inProgress} />
          <ul className="divide-y divide-line">
            {active.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/research/${p.id}?tab=workspace`} className="font-medium hover:underline">
                    <bdi>{p.name}</bdi>
                  </Link>
                  <p className="text-[13px] text-muted">
                    {p.latestJob?.status === "needs_input" ? d.waitingIdentity : p.latestJob?.currentStage ? t.stages[p.latestJob.currentStage] : d.queued}
                  </p>
                </div>
                <Badge tone={JOB_STATUS_DISPLAY[p.latestJob!.status].tone}>{t.jobStatus[p.latestJob!.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <Card id="research" className="min-w-0 scroll-mt-24">
          <CardHeader title={d.researchCardTitle} description={d.researchCardBody} />
          <div className="p-5">
            <ResearchForm enabled={cfg.searchConfigured && quota.allowed} confirmBeforeRun={confirmBeforeRun} />
            {!quota.allowed && quota.reason && (
              <p className="mt-3 text-sm text-danger">
                {quota.reason}{" "}
                {(quota.code === "free_limit" || quota.code === "free_capacity") && (
                  <Link href="/pricing" className="underline">
                    {t.nav.pricing}
                  </Link>
                )}
              </p>
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title={d.reports} />
            {saved.length === 0 ? (
              <div className="p-5">
                <EmptyState title={d.noReportsTitle}>{d.noReportsBody}</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {saved.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/research/${p.id}`} className="font-medium hover:underline">
                        <bdi>{p.input.fullName}</bdi>
                      </Link>
                      <p className="truncate text-[13px] text-muted">
                        <bdi>{[p.input.company, p.input.role].filter(Boolean).join(" · ") || d.noIdentifiers}</bdi> · {d.researchedAgo(relativeTime(p.lastResearchedAt, t, locale))}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <AccessBadge id={p.id} />
                      {p.status === "partial" && (
                        <Badge tone="moderate" title={d.incompleteTitle}>
                          <AlertTriangle className="size-3" aria-hidden /> {d.incomplete}
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={d.recentBriefs} />
            {briefs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">{d.noBriefs}</p>
            ) : (
              <ul className="divide-y divide-line">
                {briefs.map((b) => (
                  <li key={b.id} className="px-5 py-3">
                    <Link href={`/research/${b.projectId}/briefs/${b.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                      <FileText className="size-4 text-faint" aria-hidden /> <bdi>{b.projectName}</bdi>
                    </Link>
                    <p className="text-[13px] text-muted">
                      {objectiveLabel(b.objective, t)} · {formatDate(b.createdAt, locale)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title={d.historyTitle} description={d.historyBody} />
        {projects.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={d.noResearchTitle}
              action={
                <LinkButton href="/demo" variant="secondary">
                  {d.seeExample} <ArrowRight className="rtl:rotate-180" aria-hidden />
                </LinkButton>
              }
            >
              {d.noResearchBody}
            </EmptyState>
          </div>
        ) : (
          <>
            {/* Mobile: stacked list (no horizontal scrolling). */}
            <ul className="divide-y divide-line md:hidden">
              {projects.map((p) => (
                <li key={p.id} className="space-y-1 px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/research/${p.id}`} className="min-w-0 font-medium hover:underline">
                      <bdi>{p.input.fullName}</bdi>
                    </Link>
                    <Badge tone={JOB_STATUS_DISPLAY[p.status].tone}>{t.jobStatus[p.status]}</Badge>
                  </div>
                  <p className="text-[13px] text-muted">
                    <bdi>{[p.input.company, p.input.role, p.input.location].filter(Boolean).join(" · ") || d.nameOnly}</bdi>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                    <AccessBadge id={p.id} />
                    <span>{p.lastResearchedAt ? formatDate(p.lastResearchedAt, locale) : t.common.notYet}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-[12px] uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-start font-medium">{d.col.person}</th>
                    <th scope="col" className="px-5 py-2.5 text-start font-medium">{d.col.identifiers}</th>
                    <th scope="col" className="px-5 py-2.5 text-start font-medium">{d.col.status}</th>
                    {cfg.paywallEnforced && <th scope="col" className="px-5 py-2.5 text-start font-medium">{d.col.access}</th>}
                    <th scope="col" className="px-5 py-2.5 text-start font-medium">{d.col.last}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3">
                        <Link href={`/research/${p.id}`} className="font-medium hover:underline">
                          <bdi>{p.input.fullName}</bdi>
                        </Link>
                      </td>
                      <td className="max-w-xs truncate px-5 py-3 text-muted">
                        <bdi>{[p.input.company, p.input.role, p.input.location].filter(Boolean).join(" · ") || d.nameOnly}</bdi>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={JOB_STATUS_DISPLAY[p.status].tone}>{t.jobStatus[p.status]}</Badge>
                        {p.latestJob?.errorDetails && (
                          <p className="mt-1 max-w-xs truncate text-[12px] text-muted" title={localizedJobError(p.latestJob.errorDetails, t)}>
                            {localizedJobError(p.latestJob.errorDetails, t)}
                          </p>
                        )}
                      </td>
                      {cfg.paywallEnforced && (
                        <td className="px-5 py-3">
                          <AccessBadge id={p.id} />
                        </td>
                      )}
                      <td className="px-5 py-3 text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <History className="size-3.5" aria-hidden /> {p.lastResearchedAt ? formatDate(p.lastResearchedAt, locale) : t.common.notYet}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
