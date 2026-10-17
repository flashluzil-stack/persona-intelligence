import type { Metadata } from "next";
import { BriefView } from "@/components/brief/brief-view";
import { PageContainer } from "@/components/layout/site-chrome";
import { Notice } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";
import { DEMO_BRIEF, DEMO_CLAIMS, DEMO_PERSON, DEMO_SOURCES } from "@/lib/demo/fictional-profile";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.demo.viewBrief };
}

export default async function DemoBriefPage() {
  const { t, locale } = await getI18n();
  return (
    <PageContainer width="narrow" className="max-w-3xl space-y-6 py-10">
      <Notice tone="demo" title={t.demo.noticeTitle}>
        {t.demo.briefNoticeBody}
        {locale !== "en" && <span className="mt-1 block">{t.demo.sampleContentNote}</span>}
      </Notice>
      <BriefView
        personName={DEMO_PERSON.name}
        objective={t.purposes.business_partnership}
        createdAt="2026-10-02T08:15:00Z"
        brief={DEMO_BRIEF}
        claims={DEMO_CLAIMS}
        sources={DEMO_SOURCES}
      />
    </PageContainer>
  );
}
