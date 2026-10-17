import { Badge } from "@/components/ui/primitives";
import type { QualityReport } from "@/lib/research/store";
import { SOURCE_TYPE_LABELS, type SourceType } from "@/lib/research/types";

const PROVIDER_LABELS: Record<string, string> = {
  web_search: "Web search",
  ai_analysis: "AI analysis",
  page_retrieval: "Page retrieval",
};

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2.5">
      <p className="font-display text-2xl text-ink">{value}</p>
      <p className="text-[12.5px] text-muted">{label}</p>
      {hint && <p className="text-[11.5px] text-faint">{hint}</p>}
    </div>
  );
}

/** Research quality: counts and plain-language limitations. Deliberately no single score. */
export function QualitySummary({ quality }: { quality: QualityReport }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Sources found" value={quality.sourcesFound} hint={`${quality.sourcesUnrelated} about other people`} />
        <Stat label="Full pages analysed" value={quality.sourcesRetrieved} hint={`${quality.sourcesSnippetOnly} snippet only`} />
        <Stat label="Sources cited" value={quality.sourcesAnalysed} />
        <Stat label="Verified claims" value={quality.claimsExtracted} hint={`${quality.claimsRejected} discarded`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Claims by confidence</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="high">High · {quality.claimsByConfidence.high}</Badge>
            <Badge tone="moderate">Moderate · {quality.claimsByConfidence.moderate}</Badge>
            <Badge tone="low">Low · {quality.claimsByConfidence.low}</Badge>
            <Badge tone="insufficient">Insufficient · {quality.claimsByConfidence.insufficient}</Badge>
          </div>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Source categories</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(quality.sourceCategories).map(([type, n]) => (
              <Badge key={type}>
                {SOURCE_TYPE_LABELS[type as SourceType] ?? type} · {n}
              </Badge>
            ))}
            {Object.keys(quality.sourceCategories).length === 0 && <span className="text-[13px] text-muted">None</span>}
          </div>
        </div>
      </div>
      {quality.conflicts.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Conflicting claims</p>
          <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[14px] text-ink">
            {quality.conflicts.map((c) => (
              <li key={c.key}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}
      {quality.insufficientSections.length > 0 && (
        <p className="text-[14px] text-ink-soft">
          <span className="font-medium text-ink">Insufficient evidence for: </span>
          {quality.insufficientSections.join(", ")}.
        </p>
      )}
      {quality.unavailableProviders.length > 0 && (
        <p className="text-[14px] text-ink-soft">
          <span className="font-medium text-ink">Unavailable providers: </span>
          {quality.unavailableProviders.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")}.
        </p>
      )}
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Limitations</p>
        <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[14px] text-ink-soft">
          {quality.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
