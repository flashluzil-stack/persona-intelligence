import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { PROFILE_TABS, ProfileSearchBox, ProfileTabContent, ProfileTabs } from "@/components/profile/profile-view";
import { Badge, Notice } from "@/components/ui/primitives";
import { DEMO_CLAIMS, DEMO_PERSON, DEMO_QUALITY, DEMO_SECTIONS, DEMO_SOURCES } from "@/lib/demo/fictional-profile";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Fictional sample profile" };

export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const params = await searchParams;
  const requested = typeof params.tab === "string" ? params.tab : "overview";
  const tab = PROFILE_TABS.some((t) => t.id === requested) ? requested : "overview";
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : undefined;
  return (
    <PageContainer width="wide" className="space-y-6 py-10">
      <Notice tone="demo" title="Fictional demo — not real research">
        This person, the organizations, sources and quotes are invented to show how a profile looks. The links use the reserved “.example” domain and lead nowhere. No search
        was performed.
      </Notice>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone="demo">Fictional demo</Badge>
            <Badge tone="high">Identity: illustrative</Badge>
          </div>
          <h1 className="text-4xl font-semibold">{DEMO_PERSON.name}</h1>
          <p className="text-sm text-muted">
            {DEMO_PERSON.label} · Last researched {formatDate(DEMO_PERSON.lastResearchedAt)} ·{" "}
            <Link href="/demo/brief" className="underline hover:text-ink">
              View sample meeting brief
            </Link>
          </p>
        </div>
        <ProfileSearchBox base="/demo" defaultValue={q} />
      </header>
      <ProfileTabs base="/demo" active={tab} />
      <ProfileTabContent tab={tab} query={q} data={{ sections: DEMO_SECTIONS, claims: DEMO_CLAIMS, sources: DEMO_SOURCES, quality: DEMO_QUALITY }} />
    </PageContainer>
  );
}
