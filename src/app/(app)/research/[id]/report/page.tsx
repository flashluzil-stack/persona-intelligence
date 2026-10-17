import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/site-chrome";
import { ConfidenceBadge, ExternalSourceLink, SourceMeta } from "@/components/profile/evidence";
import { sourceNumbers } from "@/components/profile/profile-view";
import { SectionContent, type EvidenceContext } from "@/components/profile/sections";
import { QualitySummary } from "@/components/research/quality-summary";
import { PrintButton } from "@/components/ui/print-button";
import { requireAuth } from "@/lib/auth";
import { SECTION_LABELS, type ProfileSectionType } from "@/lib/ai/schemas";
import { loadProjectBundle } from "@/lib/db/queries";
import { uuidSchema } from "@/lib/validation/schemas";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Research report" };

const ORDER: ProfileSectionType[] = ["overview", "background", "interests", "communication", "visual_style", "values", "relationships", "recent", "open_questions"];

/** Print-friendly research report (use the browser's "Save as PDF"). */
export default async function ReportPage({ params, searchParams }: PageProps<"/research/[id]/report">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/report`);
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  const includeNotes = (await searchParams).includeNotes === "1";
  const relevant = bundle.sources.filter((s) => s.relevance !== "unrelated");
  const numbers = sourceNumbers(bundle.sources);
  const ctx: EvidenceContext = {
    claimsById: new Map(bundle.claims.map((c) => [c.id, c])),
    sourcesById: new Map(bundle.sources.map((s) => [s.id, s])),
    numbers,
  };
  const quality = bundle.jobs.find((j) => j.qualityReport)?.qualityReport ?? null;
  const name = bundle.person?.displayName ?? bundle.project.input.fullName;

  return (
    <PageContainer className="max-w-4xl space-y-10 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper-sunken px-4 py-3 text-sm">
        <Link href={`/research/${id}`} className="hover:underline">
          ← Back to profile
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/research/${id}/report${includeNotes ? "" : "?includeNotes=1"}`} className="underline">
            {includeNotes ? "Exclude my private notes" : "Include my private notes"}
          </Link>
          <PrintButton />
        </div>
      </div>

      <header className="space-y-2 border-b border-line pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Persona Intelligence · Research report</p>
        <h1 className="text-4xl font-semibold">{name}</h1>
        <p className="text-sm text-muted">
          {[bundle.project.input.company, bundle.project.input.role].filter(Boolean).join(" · ")} · Last researched {formatDate(bundle.project.lastResearchedAt)} · Printed{" "}
          {formatDate(new Date().toISOString())}
        </p>
        <p className="text-[13px] text-ink-soft">
          Compiled from public sources only. It may be incomplete or out of date and is not a background check. Verify important facts yourself, and never use it for employment,
          credit, housing or insurance decisions.
        </p>
      </header>

      {ORDER.map((type) => {
        const section = bundle.sections.find((s) => s.sectionType === type);
        if (!section) return null;
        return (
          <section key={type} className="break-inside-avoid-page space-y-4">
            <h2 className="text-2xl font-semibold">{SECTION_LABELS[type]}</h2>
            <SectionContent section={section} ctx={ctx} />
          </section>
        );
      })}

      {bundle.claims.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Evidence register</h2>
          <ul className="space-y-2">
            {bundle.claims.map((c) => (
              <li key={c.id} className="break-inside-avoid border-b border-line pb-2 text-[14px]">
                <p>
                  {c.claimText} <ConfidenceBadge label={c.confidenceLabel} />{" "}
                  <span className="font-mono text-[11px] text-muted">
                    {[...new Set(c.evidence.map((e) => numbers.get(e.sourceId)))].map((n) => `[${n}]`).join("")}
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
          <h2 className="text-2xl font-semibold">Research quality</h2>
          <QualitySummary quality={quality} />
        </section>
      )}

      {includeNotes && bundle.notes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">My private notes</h2>
          <p className="text-[13px] text-muted">Included at your request. These are your own notes, not research findings.</p>
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
        <h2 className="text-2xl font-semibold">Sources</h2>
        <ol className="space-y-2">
          {relevant.map((s) => (
            <li key={s.id} className="flex gap-3 text-[13.5px]">
              <span className="w-8 shrink-0 font-mono text-[12px] text-faint">[{numbers.get(s.id)}]</span>
              <div className="min-w-0">
                <ExternalSourceLink source={s} />
                <div>
                  <SourceMeta source={s} />
                  <span className="text-[12.5px] text-muted"> · {s.retrievalStatus === "retrieved" ? "full page analysed" : s.retrievalStatus.replace("_", " ")}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </PageContainer>
  );
}
