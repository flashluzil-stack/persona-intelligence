import { AlertTriangle, ArrowRight, FileText, History, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { JOB_STATUS_DISPLAY } from "@/lib/research/status-display";
import { ResearchForm } from "@/components/research/research-form";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Notice } from "@/components/ui/primitives";
import { requireAuth } from "@/lib/auth";
import { getPublicConfig, getResearchLimits } from "@/lib/config";
import { listProjects, listRecentBriefs } from "@/lib/db/queries";
import { reapStaleJobs } from "@/lib/research/quota";
import { STAGE_LABELS } from "@/lib/research/types";
import { formatDate, isoDaysAgo, relativeTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase, user } = await requireAuth("/dashboard");
  const cfg = getPublicConfig();
  const limits = getResearchLimits();

  // Housekeeping: ensure settings row, apply retention, release stalled jobs.
  await supabase.from("user_settings").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  await supabase.rpc("apply_my_retention");
  await reapStaleJobs(supabase);

  const since = isoDaysAgo(1);
  const [projects, briefs, settingsRes, todayRes] = await Promise.all([
    listProjects(supabase),
    listRecentBriefs(supabase),
    supabase.from("user_settings").select("daily_research_quota, research_preferences").eq("user_id", user.id).maybeSingle(),
    supabase.from("research_jobs").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const quota = settingsRes.data?.daily_research_quota ?? limits.defaultDailyResearchQuota;
  const usedToday = todayRes.count ?? 0;
  const confirmBeforeRun = (settingsRes.data?.research_preferences as { confirmBeforeResearch?: boolean } | null)?.confirmBeforeResearch ?? true;
  const active = projects.filter((p) => p.latestJob && ["queued", "running", "needs_input"].includes(p.latestJob.status));
  const saved = projects.filter((p) => ["completed", "partial"].includes(p.status));

  return (
    <PageContainer width="wide" className="space-y-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            {usedToday} of {quota} research runs used in the last 24 hours.
          </p>
        </div>
        <LinkButton href="#research" variant="primary">
          <Search aria-hidden /> Research a person
        </LinkButton>
      </header>

      {!cfg.searchConfigured && (
        <Notice tone="demo" title="Demo mode: live research is not configured">
          No web search provider is configured, so new research cannot run. Nothing is simulated. Set <code>BRAVE_SEARCH_API_KEY</code> or <code>TAVILY_API_KEY</code>{" "}
          (and <code>OPENAI_API_KEY</code> for analysis). In the meantime, explore the <Link href="/demo">fictional sample profile</Link>.
        </Notice>
      )}
      {cfg.searchConfigured && !cfg.analysisConfigured && (
        <Notice tone="warning" title="AI analysis is not configured">
          Research collects and stores real sources, but no claims, profile sections or meeting briefs can be generated until <code>OPENAI_API_KEY</code> is set.
        </Notice>
      )}

      {active.length > 0 && (
        <Card>
          <CardHeader title="Research in progress" />
          <ul className="divide-y divide-line">
            {active.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/research/${p.id}?tab=workspace`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-[13px] text-muted">
                    {p.latestJob?.status === "needs_input" ? "Waiting for you to confirm the person's identity" : p.latestJob?.currentStage ? STAGE_LABELS[p.latestJob.currentStage] : "Queued"}
                  </p>
                </div>
                <Badge tone={JOB_STATUS_DISPLAY[p.latestJob!.status].tone}>{JOB_STATUS_DISPLAY[p.latestJob!.status].label}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <Card id="research" className="scroll-mt-24">
          <CardHeader title="Research a person" description="Start with a name. Add identifiers to tell people with the same name apart." />
          <div className="p-5">
            <ResearchForm enabled={cfg.searchConfigured && usedToday < quota} confirmBeforeRun={confirmBeforeRun} />
            {usedToday >= quota && <p className="mt-3 text-sm text-danger">Daily quota reached. Try again later or adjust it in Settings.</p>}
          </div>
        </Card>

        <div className="space-y-8">
          <Card>
            <CardHeader title="Saved profiles" />
            {saved.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No profiles yet">Finished research appears here.</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {saved.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/research/${p.id}`} className="font-medium hover:underline">
                        {p.input.fullName}
                      </Link>
                      <p className="truncate text-[13px] text-muted">
                        {[p.input.company, p.input.role].filter(Boolean).join(" · ") || "No identifiers"} · researched {relativeTime(p.lastResearchedAt)}
                      </p>
                    </div>
                    {p.status === "partial" && (
                      <Badge tone="moderate" title="Some stages did not complete">
                        <AlertTriangle className="size-3" aria-hidden /> Incomplete
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent meeting briefs" />
            {briefs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No briefs yet. Open a profile and choose “Meeting preparation”.</p>
            ) : (
              <ul className="divide-y divide-line">
                {briefs.map((b) => (
                  <li key={b.id} className="px-5 py-3">
                    <Link href={`/research/${b.projectId}/briefs/${b.id}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                      <FileText className="size-4 text-faint" aria-hidden /> {b.projectName}
                    </Link>
                    <p className="text-[13px] text-muted">
                      {b.objective} · {formatDate(b.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Research projects & search history" description="All of your searches, newest first. Only you can see them." />
        {projects.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No research yet" action={<LinkButton href="/demo" variant="secondary">See a fictional example <ArrowRight aria-hidden /></LinkButton>}>
              Your search history will appear here.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-start text-[12px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 text-start font-medium">Person</th>
                  <th scope="col" className="px-5 py-2.5 text-start font-medium">Identifiers searched</th>
                  <th scope="col" className="px-5 py-2.5 text-start font-medium">Status</th>
                  <th scope="col" className="px-5 py-2.5 text-start font-medium">Last researched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {projects.map((p) => {
                  const status = JOB_STATUS_DISPLAY[p.status];
                  return (
                    <tr key={p.id}>
                      <td className="px-5 py-3">
                        <Link href={`/research/${p.id}`} className="font-medium hover:underline">
                          {p.input.fullName}
                        </Link>
                      </td>
                      <td className="max-w-xs truncate px-5 py-3 text-muted">
                        {[p.input.company, p.input.role, p.input.location].filter(Boolean).join(" · ") || "Name only"}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {p.latestJob?.errorDetails && <p className="mt-1 max-w-xs truncate text-[12px] text-muted" title={p.latestJob.errorDetails.message}>{p.latestJob.errorDetails.message}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <History className="size-3.5" aria-hidden /> {p.lastResearchedAt ? formatDate(p.lastResearchedAt) : "Not yet"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
