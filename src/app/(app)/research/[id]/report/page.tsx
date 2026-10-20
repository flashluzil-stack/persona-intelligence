import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/site-chrome";
import { PrintableReport, PrintToolbar } from "@/components/report/printable-report";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { requireUnlockedReport } from "@/lib/billing/gate";
import { loadProjectBundle } from "@/lib/db/queries";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.report.printPreview };
}

/** Print preview of a full report (the browser's print dialog can also save it as PDF). */
export default async function ReportPage({ params, searchParams }: PageProps<"/research/[id]/report">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/report`);
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  await requireUnlockedReport(supabase, id);
  const { t, locale } = await getI18n();
  const includeNotes = (await searchParams).includeNotes === "1";
  const quality = bundle.jobs.find((j) => j.qualityReport)?.qualityReport ?? null;
  const name = bundle.person?.displayName ?? bundle.project.input.fullName;

  return (
    <PageContainer className="py-8 print:max-w-none print:px-0 print:py-0">
      <PrintToolbar hint={t.report.previewHint}>
        <Link href={`/research/${id}`} className="hover:underline">
          {t.report.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/research/${id}/report${includeNotes ? "" : "?includeNotes=1"}`} className="underline">
            {includeNotes ? t.report.excludeNotes : t.report.includeNotes}
          </Link>
          <PrintButton label={t.common.print} />
        </div>
      </PrintToolbar>
      <PrintableReport
        t={t}
        name={name}
        eyebrow={t.report.eyebrow}
        metaLine={t.report.meta(
          [bundle.project.input.company, bundle.project.input.role].filter(Boolean).join(" · ") || t.project.nameOnly,
          formatDate(bundle.project.lastResearchedAt, locale),
          formatDate(new Date().toISOString(), locale),
        )}
        sections={bundle.sections}
        claims={bundle.claims}
        sources={bundle.sources}
        quality={quality}
        notes={includeNotes ? bundle.notes : undefined}
      />
    </PageContainer>
  );
}
