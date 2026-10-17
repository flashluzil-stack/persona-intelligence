import { ExternalLink } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import type { ClaimRow } from "@/lib/research/store";
import { SOURCE_TYPE_LABELS, type SourceRecord } from "@/lib/research/types";
import { isSafeExternalHref } from "@/lib/security/url";
import { formatDate } from "@/lib/utils/format";

/*
 * Evidence display primitives. Safe in both server and client components.
 * External links always open the original source with noopener/noreferrer.
 */

export const CONFIDENCE_DISPLAY: Record<ClaimRow["confidenceLabel"], { label: string; tone: BadgeTone }> = {
  high: { label: "High confidence", tone: "high" },
  moderate: { label: "Moderate confidence", tone: "moderate" },
  low: { label: "Low confidence", tone: "low" },
  insufficient: { label: "Insufficient evidence", tone: "insufficient" },
};

export const EVIDENCE_TYPE_LABELS: Record<ClaimRow["evidenceType"], string> = {
  documented_fact: "Documented fact",
  self_statement: "Their own statement",
  secondary_report: "Secondary reporting",
  interpretation: "Interpretation",
  hypothesis: "Unverified hypothesis",
  unknown: "Unknown",
};

export const VERIFICATION_LABELS: Record<ClaimRow["verificationStatus"], string> = {
  corroborated: "Corroborated",
  single_source: "Single source",
  conflicting: "Conflicting sources",
  unverified: "Unverified",
};

export function ConfidenceBadge({ label, rationale }: { label: ClaimRow["confidenceLabel"]; rationale?: string }) {
  const d = CONFIDENCE_DISPLAY[label];
  return (
    <Badge tone={d.tone} title={rationale}>
      {d.label}
    </Badge>
  );
}

export function ExternalSourceLink({ source, className }: { source: Pick<SourceRecord, "url" | "title" | "domain">; className?: string }) {
  if (!isSafeExternalHref(source.url)) return <span className={className}>{source.title ?? source.domain}</span>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`print-url inline-flex items-baseline gap-1 text-ink underline decoration-line-strong hover:decoration-accent ${className ?? ""}`}
    >
      <span className="break-words">{source.title || source.domain}</span>
      <ExternalLink className="size-3 shrink-0 translate-y-[1px] text-faint" aria-hidden />
      <span className="sr-only">(opens original source in a new tab)</span>
    </a>
  );
}

/** Numbered citation chips linking directly to the original sources. */
export function CitationChips({ sources, numbers }: { sources: SourceRecord[]; numbers: Map<string, number> }) {
  if (sources.length === 0) {
    return (
      <Badge tone="insufficient" className="ms-1 align-middle">
        No source
      </Badge>
    );
  }
  return (
    <span className="ms-1 inline-flex flex-wrap gap-0.5 align-baseline">
      {sources.map((s) => (
        <a
          key={s.id}
          href={isSafeExternalHref(s.url) ? s.url : undefined}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={`${s.title ?? s.domain} — ${s.domain}${s.publishedAt ? `, ${formatDate(s.publishedAt)}` : ""}`}
          className="rounded-sm border border-line bg-paper-sunken px-1 font-mono text-[10.5px] leading-[16px] text-ink-soft no-underline hover:border-accent hover:text-accent"
        >
          {numbers.get(s.id) ?? "•"}
          <span className="sr-only"> source: {s.title ?? s.domain}</span>
        </a>
      ))}
    </span>
  );
}

export function SourceMeta({ source }: { source: SourceRecord }) {
  return (
    <span className="text-[12.5px] text-muted">
      {source.domain} · {SOURCE_TYPE_LABELS[source.sourceType]} · published {source.publishedAt ? formatDate(source.publishedAt) : "date unknown"} · accessed{" "}
      {formatDate(source.accessedAt)}
    </span>
  );
}

export function ClaimCard({ claim, sourcesById }: { claim: ClaimRow; sourcesById: Map<string, SourceRecord> }) {
  return (
    <article className="rounded-md border border-line bg-paper-raised px-4 py-3">
      <p className="text-[15px] leading-relaxed text-ink">{claim.claimText}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ConfidenceBadge label={claim.confidenceLabel} rationale={claim.confidenceRationale} />
        <Badge tone={claim.verificationStatus === "conflicting" ? "danger" : "neutral"}>{VERIFICATION_LABELS[claim.verificationStatus]}</Badge>
        <Badge>{EVIDENCE_TYPE_LABELS[claim.evidenceType]}</Badge>
        {claim.temporalStatus !== "unknown" && <Badge>{claim.temporalStatus === "current" ? "Current" : "Historical"}</Badge>}
        {claim.lastObservedDate && <span className="text-[12px] text-muted">Latest source: {formatDate(claim.lastObservedDate)}</span>}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        <span className="font-medium text-ink-soft">Why this label: </span>
        {claim.confidenceRationale}
      </p>
      {claim.limitations && <p className="mt-1 text-[13px] text-low">{claim.limitations}</p>}
      <details className="group mt-2">
        <summary className="cursor-pointer select-none text-[13px] font-medium text-accent hover:underline">
          Evidence ({claim.evidence.length})
        </summary>
        <ul className="mt-2 space-y-2">
          {claim.evidence.map((e) => {
            const source = sourcesById.get(e.sourceId);
            return (
              <li key={e.id} className="border-s-2 border-line-strong ps-3">
                <blockquote className="text-[13.5px] italic text-ink-soft">“{e.supportingExcerpt}”</blockquote>
                <div className="mt-1 text-[13px]">
                  {source ? <ExternalSourceLink source={source} /> : <span className="text-muted">Source removed</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-muted">
                  {source && <SourceMeta source={source} />}
                  <span>· {e.relationship === "supports" ? "Supports" : e.relationship === "contradicts" ? "Contradicts" : "Context"}</span>
                  <span>· support: {e.supportStrength}</span>
                  <span>· source type: {e.sourceCredibility.replace("_", " ")}</span>
                </div>
                {e.notes && <p className="mt-0.5 text-[12px] text-muted">{e.notes}</p>}
              </li>
            );
          })}
        </ul>
      </details>
    </article>
  );
}
