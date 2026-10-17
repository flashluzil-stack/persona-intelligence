import { Download, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, CardHeader, Notice } from "@/components/ui/primitives";
import { formatDate, formatMoney, formatNumber, isoDaysAgo } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { getEnabledSocialProviders } from "@/lib/auth-providers";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getPublicConfig, getResearchLimits } from "@/lib/config";
import { DeleteAccountForm, LanguagePreference, PreferencesForm, SubscriptionControls } from "./settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

function ProviderRow({ name, configured, detail, env, labels }: { name: string; configured: boolean; detail: string; env: string; labels: { on: string; off: string; setting: (e: string) => string } }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        <p className="text-[13px] text-muted">{detail}</p>
        {!configured && (
          <p className="mt-0.5 break-words text-[12.5px] text-muted" dir="auto">
            {labels.setting(env)}
          </p>
        )}
      </div>
      <Badge tone={configured ? "high" : "moderate"}>{configured ? labels.on : labels.off}</Badge>
    </li>
  );
}

export default async function SettingsPage() {
  const { supabase, user } = await requireAuth("/settings");
  const { t, locale } = await getI18n();
  const s = t.settings;
  const b = t.billingPanel;
  const cfg = getPublicConfig();
  const limits = getResearchLimits();
  const guest = Boolean(user.is_anonymous);
  const since = isoDaysAgo(30);
  const [{ data: settings }, { data: usage }, { count: projectCount }, { data: purchases }, entitlements, social] = await Promise.all([
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("usage_events").select("kind, units, input_tokens, output_tokens").gte("created_at", since).limit(10_000),
    supabase.from("research_projects").select("id", { count: "exact", head: true }),
    supabase.from("purchases").select("id, kind, product_key, status, amount_minor, currency, created_at, research_project_id").neq("status", "pending").order("created_at", { ascending: false }).limit(50),
    getEntitlements(supabase),
    getEnabledSocialProviders(),
  ]);
  const totals = { search_query: 0, page_fetch: 0, ai_call: 0, tokens: 0 };
  for (const u of usage ?? []) {
    totals[u.kind as "search_query" | "page_fetch" | "ai_call"] += u.units ?? 1;
    totals.tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
  }
  const prefs = (settings?.research_preferences as { confirmBeforeResearch?: boolean } | null) ?? {};
  const sub = entitlements.subscription;
  const rowLabels = { on: s.configured, off: s.notConfigured, setting: s.serverSetting };

  return (
    <PageContainer className="max-w-4xl space-y-8 py-10">
      <h1 className="text-3xl font-semibold">{s.title}</h1>

      {guest && (
        <Notice tone="info" title={s.guestTitle}>
          {s.guestBody}{" "}
          <Link href="/sign-up?next=/settings" className="font-medium underline">
            {t.nav.createAccount}
          </Link>
        </Notice>
      )}

      <Card>
        <CardHeader title={s.account} />
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-muted">{s.email}</dt>
            <dd className="break-all font-medium" dir="ltr">
              {guest ? t.common.guest : user.email}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{s.memberSince}</dt>
            <dd>{formatDate(user.created_at, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted">{s.projects}</dt>
            <dd>{formatNumber(projectCount ?? 0, locale)}</dd>
          </div>
        </dl>
        <div className="border-t border-line p-5">
          <LanguagePreference />
        </div>
      </Card>

      <Card id="billing" className="scroll-mt-24">
        <CardHeader title={b.title} />
        {!cfg.paymentsConfigured && <p className="px-5 pt-4 text-sm text-muted">{b.notConfigured}</p>}
        <div className="grid gap-6 p-5 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted">{b.credits}</p>
            <p className="font-display text-2xl">{b.creditsBalance(entitlements.credits)}</p>
            {cfg.paymentsConfigured && !guest && (
              <Link href="/pricing" className="text-sm text-accent hover:underline">
                {b.buyCredits}
              </Link>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted">{b.subscription}</p>
            {sub ? (
              <>
                <p className="text-[15px] font-medium">
                  {t.pricing.products[sub.productKey === "annual" ? "annual" : "monthly"].name} · {b.status[sub.status]}
                </p>
                <p className="text-[13px] text-muted">
                  {sub.cancelAtPeriodEnd || sub.status === "canceled" ? b.endsOn(formatDate(sub.currentPeriodEnd, locale)) : b.renewsOn(formatDate(sub.currentPeriodEnd, locale))}
                </p>
                {sub.grantsAccess && <p className="text-[13px] text-muted">{b.fairUse(sub.usedThisPeriod, sub.periodLimit)}</p>}
                {cfg.paymentsConfigured && sub.status !== "canceled" && <SubscriptionControls cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />}
              </>
            ) : (
              <>
                <p className="text-[15px]">{b.noSubscription}</p>
                <Link href="/pricing" className="text-sm text-accent hover:underline">
                  {b.plans}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="border-t border-line px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold">{b.purchases}</h3>
            {cfg.paymentsConfigured && (purchases?.length ?? 0) > 0 && (
              <LinkButton href="/api/billing/portal" size="sm" variant="secondary" prefetch={false}>
                <ExternalLink aria-hidden /> {b.manage}
              </LinkButton>
            )}
          </div>
          {(purchases?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted">{b.noPurchases}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {purchases!.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    {b.kinds[p.kind as keyof typeof b.kinds]}
                    {p.research_project_id && (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/research/${p.research_project_id}`} className="underline">
                          {t.nav.research}
                        </Link>
                      </>
                    )}
                    <span className="block text-[12.5px] text-muted">{formatDate(p.created_at, locale)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {p.amount_minor != null && p.currency && <bdi>{formatMoney(Number(p.amount_minor), p.currency, locale)}</bdi>}
                    <Badge tone={p.status === "paid" ? "high" : p.status === "refunded" ? "neutral" : "danger"}>
                      {b.purchaseStatus[p.status as keyof typeof b.purchaseStatus]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={s.providersTitle} description={s.providersBody} />
        <ul className="divide-y divide-line">
          <ProviderRow name={s.provider.search.name} configured={cfg.searchConfigured} env="SEARCH_PROVIDER + BRAVE_SEARCH_API_KEY / TAVILY_API_KEY" detail={s.provider.search.detail(cfg.searchProvider)} labels={rowLabels} />
          <ProviderRow name={s.provider.ai.name} configured={cfg.analysisConfigured} env="OPENAI_API_KEY" detail={s.provider.ai.detail(cfg.analysisModel)} labels={rowLabels} />
          <ProviderRow name={s.provider.retrieval.name} configured={cfg.pageRetrievalEnabled} env="RESEARCH_DISABLE_PAGE_FETCH" detail={s.provider.retrieval.detail} labels={rowLabels} />
          <ProviderRow name={s.provider.payments.name} configured={cfg.paymentsConfigured} env="PADDLE_* + SUPABASE_SERVICE_ROLE_KEY" detail={s.provider.payments.detail} labels={rowLabels} />
          <ProviderRow name={s.provider.social.name} configured={social.length > 0} env="Supabase → Authentication → Providers" detail={s.provider.social.detail} labels={rowLabels} />
          <ProviderRow name={s.provider.visual.name} configured={cfg.imageAnalysisEnabled} env="—" detail={s.provider.visual.detail} labels={rowLabels} />
        </ul>
      </Card>

      <Card>
        <CardHeader
          title={s.usageTitle}
          description={s.usageBody(limits.maxQueriesPerJob, limits.maxPageFetchesPerJob, limits.maxAiCallsPerJob, settings?.daily_research_quota ?? limits.defaultDailyResearchQuota)}
        />
        <dl className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">{s.searchQueries}</dt>
            <dd className="font-display text-2xl">{formatNumber(totals.search_query, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted">{s.pages}</dt>
            <dd className="font-display text-2xl">{formatNumber(totals.page_fetch, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted">{s.aiCalls}</dt>
            <dd className="font-display text-2xl">{formatNumber(totals.ai_call, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted">{s.tokens}</dt>
            <dd className="font-display text-2xl">{formatNumber(totals.tokens, locale)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title={s.prefsTitle} />
        <div className="p-5">
          <PreferencesForm displayName={settings?.display_name ?? ""} retentionDays={settings?.retention_days ?? 365} confirmBeforeResearch={prefs.confirmBeforeResearch ?? true} />
        </div>
      </Card>

      <Card>
        <CardHeader title={s.dataTitle} description={s.dataBody} />
        <div className="space-y-3 p-5">
          <LinkButton href="/api/account/export" variant="secondary" prefetch={false}>
            <Download aria-hidden /> {s.exportAll}
          </LinkButton>
          <p className="text-[13px] text-muted">
            {s.howHandled}
            <Link href="/privacy" className="underline">
              {s.privacyLink}
            </Link>
          </p>
        </div>
      </Card>

      <Card className="border-danger/30">
        <CardHeader title={s.deleteTitle} description={s.deleteBody} />
        <div className="p-5">
          <DeleteAccountForm />
        </div>
      </Card>
    </PageContainer>
  );
}
