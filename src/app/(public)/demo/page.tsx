import type { Metadata } from "next";
import { Printer } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { ProfileSearchBox, ProfileTabContent, ProfileTabs } from "@/components/profile/profile-view";
import { LinkButton } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/primitives";
import { formatDate } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { PROFILE_TAB_IDS } from "@/lib/research/tabs";
import { DEMO_CLAIMS, DEMO_PERSON, DEMO_QUALITY, DEMO_SECTIONS, DEMO_SOURCES } from "@/lib/demo/fictional-profile";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.sample };
}

/** The fictional sample report: always labelled, always available without an account. */
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const params = await searchParams;
  const { t, locale } = await getI18n();
  const requested = typeof params.tab === "string" ? params.tab : "overview";
  const tab = (PROFILE_TAB_IDS as readonly string[]).includes(requested) ? requested : "overview";
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : undefined;
  return (
    <PageContainer width="wide" className="space-y-6 py-10">
      <Notice tone="demo" title={t.demo.noticeTitle}>
        {t.demo.noticeBody}
        {locale !== "en" && <span className="mt-1 block">{t.demo.sampleContentNote}</span>}
      </Notice>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="demo">{t.landing.fictional}</Badge>
            <Badge tone="high">{t.demo.identityIllustrative}</Badge>
          </div>
          <h1 className="text-4xl font-semibold">
            <bdi>{DEMO_PERSON.name}</bdi>
          </h1>
          <p className="text-sm text-muted">
            <bdi>{DEMO_PERSON.label}</bdi> · {t.demo.lastResearched(formatDate(DEMO_PERSON.lastResearchedAt, locale))} ·{" "}
            <Link href="/demo/brief" className="underline hover:text-ink">
              {t.demo.viewBrief}
            </Link>
          </p>
          <LinkButton href="/demo/report" size="sm" variant="secondary" className="no-print">
            <Printer aria-hidden /> {t.report.printPreview}
          </LinkButton>
        </div>
        <ProfileSearchBox base="/demo" defaultValue={q} />
      </header>
      <ProfileTabs base="/demo" active={tab} />
      <div lang="en" dir="auto">
        <ProfileTabContent tab={tab} query={q} data={{ sections: DEMO_SECTIONS, claims: DEMO_CLAIMS, sources: DEMO_SOURCES, quality: DEMO_QUALITY }} />
      </div>
    </PageContainer>
  );
}
