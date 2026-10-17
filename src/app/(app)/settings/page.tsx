import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { requireAuth } from "@/lib/auth";
import { getPublicConfig, getResearchLimits } from "@/lib/config";
import { formatDate, isoDaysAgo } from "@/lib/utils/format";
import { DeleteAccountForm, PreferencesForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

function ProviderRow({ name, configured, detail, env }: { name: string; configured: boolean; detail: string; env: string }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-[13px] text-muted">{detail}</p>
        {!configured && <p className="mt-0.5 text-[12.5px] text-muted">Server setting: <code>{env}</code> (see README)</p>}
      </div>
      <Badge tone={configured ? "high" : "moderate"}>{configured ? "Configured" : "Not configured"}</Badge>
    </li>
  );
}

export default async function SettingsPage() {
  const { supabase, user } = await requireAuth("/settings");
  const cfg = getPublicConfig();
  const limits = getResearchLimits();
  const since = isoDaysAgo(30);
  const [{ data: settings }, { data: usage }, { count: projectCount }] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("usage_events").select("kind, units, input_tokens, output_tokens").gte("created_at", since).limit(10_000),
    supabase.from("research_projects").select("id", { count: "exact", head: true }),
  ]);
  const totals = { search_query: 0, page_fetch: 0, ai_call: 0, tokens: 0 };
  for (const u of usage ?? []) {
    totals[u.kind as "search_query" | "page_fetch" | "ai_call"] += u.units ?? 1;
    totals.tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
  }
  const prefs = (settings?.research_preferences as { confirmBeforeResearch?: boolean } | null) ?? {};

  return (
    <PageContainer className="max-w-4xl space-y-8 py-10">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <Card>
        <CardHeader title="Account" />
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Member since</dt>
            <dd>{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt className="text-muted">Research projects</dt>
            <dd>{projectCount ?? 0}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Research providers" description="Configured by the server operator. API keys are never shown or sent to your browser." />
        <ul className="divide-y divide-line">
          <ProviderRow name="Live web search" configured={cfg.searchConfigured} env="SEARCH_PROVIDER + BRAVE_SEARCH_API_KEY or TAVILY_API_KEY" detail={cfg.searchProvider ? `Provider: ${cfg.searchProvider}` : "Required to run any research. Without it the app is in demo mode."} />
          <ProviderRow name="AI analysis" configured={cfg.analysisConfigured} env="OPENAI_API_KEY (optional OPENAI_MODEL)" detail={cfg.analysisModel ? `Model: ${cfg.analysisModel}` : "Required for claims, profiles and meeting briefs."} />
          <ProviderRow name="Public page retrieval" configured={cfg.pageRetrievalEnabled} env="RESEARCH_DISABLE_PAGE_FETCH" detail="Fetches permitted pages only (robots.txt, no logins or paywalls) with SSRF protection." />
          <ProviderRow name="Visual style analysis" configured={cfg.imageAnalysisEnabled} env="—" detail="Not implemented in this version. No images are analysed and no facial recognition is ever used." />
        </ul>
      </Card>

      <Card>
        <CardHeader title="Usage (last 30 days)" description={`Limits per research run: ${limits.maxQueriesPerJob} searches, ${limits.maxPageFetchesPerJob} page retrievals, ${limits.maxAiCallsPerJob} AI calls. Daily quota: ${settings?.daily_research_quota ?? limits.defaultDailyResearchQuota} runs.`} />
        <dl className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Search queries</dt>
            <dd className="font-display text-2xl">{totals.search_query}</dd>
          </div>
          <div>
            <dt className="text-muted">Pages retrieved</dt>
            <dd className="font-display text-2xl">{totals.page_fetch}</dd>
          </div>
          <div>
            <dt className="text-muted">AI calls</dt>
            <dd className="font-display text-2xl">{totals.ai_call}</dd>
          </div>
          <div>
            <dt className="text-muted">AI tokens</dt>
            <dd className="font-display text-2xl">{totals.tokens.toLocaleString()}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Research preferences & retention" />
        <div className="p-5">
          <PreferencesForm displayName={settings?.display_name ?? ""} retentionDays={settings?.retention_days ?? 365} confirmBeforeResearch={prefs.confirmBeforeResearch ?? true} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Your data" description="Download everything stored for your account as JSON: projects, sources, claims, profiles, briefs, private notes and audit history." />
        <div className="space-y-3 p-5">
          <LinkButton href="/api/account/export" variant="secondary" prefetch={false}>
            <Download aria-hidden /> Export all my data
          </LinkButton>
          <p className="text-[13px] text-muted">
            How data is handled: <Link href="/privacy" className="underline">privacy, ethics &amp; limitations</Link>.
          </p>
        </div>
      </Card>

      <Card className="border-danger/30">
        <CardHeader title="Delete account" description="Permanently deletes your account and all research projects, sources, briefs and notes. This cannot be undone." />
        <div className="p-5">
          <DeleteAccountForm />
        </div>
      </Card>
    </PageContainer>
  );
}
