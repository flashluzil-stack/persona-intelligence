import type { ReactNode } from "react";
import { ConfidenceBadge, ExternalSourceLink, SourceMeta } from "@/components/profile/evidence";
import { SectionContent } from "@/components/profile/sections";
import { QualitySummary } from "@/components/research/quality-summary";
import type { Messages } from "@/i18n/messages";
import type { ProfileSectionType } from "@/lib/ai/schemas";
import { evidenceContext } from "@/lib/research/numbering";
import type { ClaimRow, QualityReport, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";

const ORDER: ProfileSectionType[] = ["overview", "background", "interests", "communication", "visual_style", "values", "relationships", "recent", "open_questions"];

/**
 * The report as it is printed. On screen it is shown as a sheet of paper
 * (a print preview); when printed, the sheet styling falls away and the
 * browser paginates it. Shared by full reports and the fictional sample.
 */
export function PrintableReport({
  t,
  name,
  eyebrow,
  metaLine,
  banner,
  sections,
  claims,
  sources,
  quality,
  notes,
}: {
  t: Messages;
  name: string;
  eyebrow: string;
  metaLine: string;
  /** Shown at the top of the sheet and on paper (e.g. the fictional-sample label). */
  banner?: ReactNode;
  sections: SectionRow[];
  claims: ClaimRow[];
  sources: SourceRecord[];
  quality: QualityReport | null;
  notes?: Array<{ id: string; content: string }>;
}) {
  const ctx = evidenceContext(claims, sources);
  const numbers = ctx.numbers;
  const relevant = sources.filter((s) => s.relevance !== "unrelated").sort((a, b) => (numbers[a.id] ?? 0) - (numbers[b.id] ?? 0));

  return (
    <article className="mx-auto w-full max-w-[210mm] space-y-10 rounded-sm border border-line bg-white p-5 shadow-[0_2px_24px_rgba(0,0,0,0.08)] sm:p-[14mm] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="space-y-2 border-b border-line pb-6">
        {banner}
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
        <h1 className="break-words text-3xl font-semibold sm:text-4xl">
          <bdi>{name}</bdi>
        </h1>
        <p className="text-sm text-muted">{metaLine}</p>
        <p className="text-[13px] text-ink-soft">{t.project.disclaimer}</p>
      </header>

      {ORDER.map((type) => {
        const section = sections.find((s) => s.sectionType === type);
        if (!section) return null;
        return (
          <section key={type} className="space-y-4">
            <h2 className="break-after-avoid text-2xl font-semibold">{t.sectionLabels[type]}</h2>
            <SectionContent section={section} ctx={ctx} />
          </section>
        );
      })}

      {claims.length > 0 && (
        <section className="space-y-3">
          <h2 className="break-after-avoid text-2xl font-semibold">{t.report.evidenceRegister}</h2>
          <ul className="space-y-2">
            {claims.map((c) => (
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
        <section className="space-y-3">
          <h2 className="break-after-avoid text-2xl font-semibold">{t.sections.qualityTitle}</h2>
          <QualitySummary quality={quality} />
        </section>
      )}

      {notes && notes.length > 0 && (
        <section className="space-y-3">
          <h2 className="break-after-avoid text-2xl font-semibold">{t.report.myNotes}</h2>
          <p className="text-[13px] text-muted">{t.report.notesIncluded}</p>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="whitespace-pre-wrap rounded-md border border-dashed border-line-strong px-3 py-2 text-[14px]" dir="auto">
                {n.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="break-after-avoid text-2xl font-semibold">{t.report.sources}</h2>
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
                <p className="hidden break-all text-[11px] text-muted print:block" dir="ltr">
                  {s.url}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

/** Toolbar above the sheet: hidden on paper. */
export function PrintToolbar({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <div className="no-print mx-auto mb-6 w-full max-w-[210mm] space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper-sunken px-4 py-3 text-sm">{children}</div>
      <p className="px-1 text-[12.5px] text-muted">{hint}</p>
    </div>
  );
}
