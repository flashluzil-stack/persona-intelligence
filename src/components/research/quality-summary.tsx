"use client";

import { Badge } from "@/components/ui/primitives";
import { formatNumber } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";
import type { QualityReport } from "@/lib/research/store";
import type { SourceType } from "@/lib/research/types";
import { SourceCoverage } from "./source-coverage";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2.5">
      <p className="font-display text-2xl text-ink">{value}</p>
      <p className="text-[12.5px] text-muted">{label}</p>
      {hint && <p className="text-[11.5px] text-faint">{hint}</p>}
    </div>
  );
}

/** Research quality: counts and plain-language limitations — deliberately no single score. */
export function QualitySummary({ quality, showCoverage = true }: { quality: QualityReport; showCoverage?: boolean }) {
  const { t, locale } = useI18n();
  const q = t.quality;
  const n = (v: number) => formatNumber(v, locale);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={q.sourcesFound} value={n(quality.sourcesFound)} hint={q.otherPeople(quality.sourcesUnrelated)} />
        <Stat label={q.fullPages} value={n(quality.sourcesRetrieved)} hint={q.snippetOnly(quality.sourcesSnippetOnly)} />
        <Stat label={q.sourcesCited} value={n(quality.sourcesAnalysed)} />
        <Stat label={q.verifiedClaims} value={n(quality.claimsExtracted)} hint={q.discarded(quality.claimsRejected)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{q.byConfidence}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="high">{q.high} · {quality.claimsByConfidence.high}</Badge>
            <Badge tone="moderate">{q.moderate} · {quality.claimsByConfidence.moderate}</Badge>
            <Badge tone="low">{q.low} · {quality.claimsByConfidence.low}</Badge>
            <Badge tone="insufficient">{q.insufficient} · {quality.claimsByConfidence.insufficient}</Badge>
          </div>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{q.categories}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(quality.sourceCategories).map(([type, count]) => (
              <Badge key={type}>
                {t.sourceTypes[type as SourceType] ?? type} · {count}
              </Badge>
            ))}
            {Object.keys(quality.sourceCategories).length === 0 && <span className="text-[13px] text-muted">{t.common.none}</span>}
          </div>
        </div>
      </div>
      {quality.conflicts.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{q.conflicting}</p>
          <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[14px] text-ink">
            {quality.conflicts.map((c) => (
              <li key={c.key} dir="auto">{c.description}</li>
            ))}
          </ul>
        </div>
      )}
      {quality.insufficientSections.length > 0 && (
        <p className="text-[14px] text-ink-soft">
          <span className="font-medium text-ink">{q.insufficientFor}</span>
          {quality.insufficientSections.join(", ")}.
        </p>
      )}
      {quality.unavailableProviders.length > 0 && (
        <p className="text-[14px] text-ink-soft">
          <span className="font-medium text-ink">{q.unavailable}</span>
          {quality.unavailableProviders.map((p) => q.providers[p as keyof typeof q.providers] ?? p).join(", ")}.
        </p>
      )}
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{q.limitations}</p>
        <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[14px] text-ink-soft">
          {quality.limitations.map((l, i) => (
            <li key={i} dir="auto">{l}</li>
          ))}
        </ul>
      </div>
      {showCoverage && quality.categories && quality.categories.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{t.coverage.title}</p>
          <SourceCoverage categories={quality.categories} providers={quality.providers ?? []} />
        </div>
      )}
    </div>
  );
}
