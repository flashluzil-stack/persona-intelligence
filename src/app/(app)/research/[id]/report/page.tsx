import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/site-chrome";
import { ConfidenceBadge, ExternalSourceLink, SourceMeta } from "@/components/profile/evidence";
import { SectionContent } from "@/components/profile/sections";
import { QualitySummary } from "@/components/research/quality-summary";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { ProfileSectionType } from "@/lib/ai/schemas";
import { requireAuth } from "@/lib/auth";
import { requireUnlockedReport } from "@/lib/billing/gate";
import { loadProjectBundle } from "@/lib/db/queries";
import { evidenceContext } from "@/lib/research/numbering";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.report.eyebrow };
}

const ORDER: ProfileSectionType[] = ["overview", "background", "interests", "communication", "visual_style", "values", "relationships", "recent", "open_questions"];

/** Print-friendly research report (use the browser's "Save as PDF"). */
export default async function ReportPage({ params, searchParams }: PageProps<"/research/[id]/report">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/report`);
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  await requireUnlockedReport(supabase, id);
  const { t, locale } = await getI18n();
  const includeNotes = (await searchParams).includeNotes === "1";
  const relevant = bundle.sources.filter((s) => s.relevance !== "unrelated");
  const ctx = evidenceContext(bundle.claims, bundle.sources);
  const numbers = ctx.numbers;
  const quality = bundle.jobs.find((j) => j.qualityReport)?.qualityReport ?? null;
  const name = bundle.person?.displayName ?? bundle.project.input.fullName;

  return (
    <PageContainer className="max-w-4xl space-y-10 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper-sunken px-4 py-3 text-sm">
        <Link href={`/research/${id}`} className="hover:underline">
          {t.report.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/research/${id}/report${includeNotes ? "" : "?includeNotes=1"}`} className="underline">
            {includeNotes ? t.report.excludeNotes : t.report.includeNotes}
          </Link>
          <PrintButton label={t.common.print} />
        </div>
      </div>

      <header className="space-y-2 border-b border-line pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{t.report.eyebrow}</p>
        <h1 className="text-4xl font-semibold">
          <bdi>{name}</bdi>
        </h1>
        <p className="text-sm text-muted">
          {t.report.meta(
            [bundle.project.input.company, bundle.project.input.role].filter(Boolean).join(" · ") || t.project.nameOnly,
            formatDate(bundle.project.lastResearchedAt, locale),
            formatDate(new Date().toISOString(), locale),
          )}
        </p>
        <p className="text-[13px] text-ink-soft">{t.project.disclaimer}</p>
      </header>

      {ORDER.map((type) => {
        const section = bundle.sections.find((s) => s.sectionType === type);
        if (!section) return null;
        return (
          <section key={type} className="break-inside-avoid-page space-y-4">
            <h2 className="text-2xl font-semibold">{t.sectionLabels[type]}</h2>
            <SectionContent section={section} ctx={ctx} />
          </section>
        );
      })}

      {bundle.claims.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">{t.report.evidenceRegister}</h2>
          <ul className="space-y-2">
            {bundle.claims.map((c) => (
              <li key={c.id} className="break-inside-avoid border-b border-line pb-2 text-[14px]">
                <p dir="auto">
                  {c.claimText} <ConfidenceBadge label={c.confidenceLabel} />{" "}
                  <span className="font-mono text-[11px] text-muted">
                    {[...new Set(c.evidence.map((e) => numbers[e.sourceId]))].map((n) => `[${n}]`).join("")}
                  </span>
                </p>
                <p className="text-[12.5px] text-muted">{c.confidenceRationale}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {quality && (
        <section className="break-inside-avoid-page space-y-3">
          <h2 className="text-2xl font-semibold">{t.sections.qualityTitle}</h2>
          <QualitySummary quality={quality} />
        </section>
      )}

      {includeNotes && bundle.notes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">{t.report.myNotes}</h2>
          <p className="text-[13px] text-muted">{t.report.notesIncluded}</p>
          <ul className="space-y-2">
            {bundle.notes.map((n) => (
              <li key={n.id} className="whitespace-pre-wrap rounded-md border border-dashed border-line-strong px-3 py-2 text-[14px]">
                {n.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">{t.report.sources}</h2>
        <ol className="space-y-2">
          {relevant.map((s) => (
            <li key={s.id} className="flex gap-3 text-[13.5px]">
              <span className="w-8 shrink-0 font-mono text-[12px] text-faint">[{numbers[s.id]}]</span>
              <div className="min-w-0">
                <ExternalSourceLink source={s} />
                <div>
                  <SourceMeta source={s} />
                  <span className="text-[12.5px] text-muted"> · {t.explorers.retrieval[s.retrievalStatus as keyof typeof t.explorers.retrieval] ?? s.retrievalStatus}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </PageContainer>
  );
}
