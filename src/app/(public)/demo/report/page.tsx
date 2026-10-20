import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { PrintableReport, PrintToolbar } from "@/components/report/printable-report";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { DEMO_CLAIMS, DEMO_PERSON, DEMO_QUALITY, DEMO_SECTIONS, DEMO_SOURCES } from "@/lib/demo/fictional-profile";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.demo.printPreview };
}

/** Print preview of the fictional sample report. Labelled as fictional on screen and on paper. */
export default async function DemoReportPage() {
  const { t, locale } = await getI18n();
  return (
    <PageContainer className="py-8 print:max-w-none print:px-0 print:py-0">
      <PrintToolbar hint={t.report.previewHint}>
        <Link href="/demo" className="hover:underline">
          {t.demo.backToSample}
        </Link>
        <PrintButton label={t.common.print} />
      </PrintToolbar>
      <PrintableReport
        t={t}
        name={DEMO_PERSON.name}
        eyebrow={t.report.sampleEyebrow}
        metaLine={t.report.meta(DEMO_PERSON.label, formatDate(DEMO_PERSON.lastResearchedAt, locale), formatDate(new Date().toISOString(), locale))}
        banner={
          <p className="mb-3 rounded-md border border-line-strong px-3 py-2 text-[13px] font-medium text-ink">
            {t.demo.noticeTitle}. {t.demo.noticeBody}
            {locale !== "en" && <span className="mt-1 block font-normal">{t.demo.sampleContentNote}</span>}
          </p>
        }
        sections={DEMO_SECTIONS}
        claims={DEMO_CLAIMS}
        sources={DEMO_SOURCES}
        quality={DEMO_QUALITY}
      />
    </PageContainer>
  );
}
