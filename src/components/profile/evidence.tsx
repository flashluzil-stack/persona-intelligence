"use client";

import { ExternalLink } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import { formatDate } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";
import type { ClaimRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { isSafeExternalHref } from "@/lib/security/url";

/*
 * Evidence display primitives. External links always open the original source
 * with noopener/noreferrer. Source-controlled text (titles, excerpts, claims)
 * is rendered with dir="auto" so Hebrew/English mixes display correctly.
 */

export const CONFIDENCE_TONES: Record<ClaimRow["confidenceLabel"], BadgeTone> = {
  high: "high",
  moderate: "moderate",
  low: "low",
  insufficient: "insufficient",
};

export function ConfidenceBadge({ label, rationale }: { label: ClaimRow["confidenceLabel"]; rationale?: string }) {
  const { t } = useI18n();
  return (
    <Badge tone={CONFIDENCE_TONES[label]} title={rationale}>
      {t.evidence.confidence[label]}
    </Badge>
  );
}

export function ExternalSourceLink({ source, className }: { source: Pick<SourceRecord, "url" | "title" | "domain">; className?: string }) {
  const { t } = useI18n();
  if (!isSafeExternalHref(source.url)) return <bdi className={className}>{source.title ?? source.domain}</bdi>;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`print-url inline-flex items-baseline gap-1 text-ink underline decoration-line-strong hover:decoration-accent ${className ?? ""}`}
    >
      <bdi className="break-words">{source.title || source.domain}</bdi>
      <ExternalLink className="size-3 shrink-0 translate-y-[1px] text-faint" aria-hidden />
      <span className="sr-only">{t.common.opensInNewTab}</span>
    </a>
  );
}

/** Numbered citation chips linking directly to the original sources. */
export function CitationChips({ sources, numbers }: { sources: SourceRecord[]; numbers: Record<string, number> }) {
  const { t, locale } = useI18n();
  if (sources.length === 0) {
    return (
      <Badge tone="insufficient" className="ms-1 align-middle">
        {t.evidence.noSource}
      </Badge>
    );
  }
  return (
    <span className="ms-1 inline-flex flex-wrap gap-0.5 align-baseline" dir="ltr">
      {sources.map((s) => (
        <a
          key={s.id}
          href={isSafeExternalHref(s.url) ? s.url : undefined}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={`${s.title ?? s.domain} — ${s.domain}${s.publishedAt ? `, ${formatDate(s.publishedAt, locale)}` : ""}`}
          className="rounded-sm border border-line bg-paper-sunken px-1 font-mono text-[10.5px] leading-[16px] text-ink-soft no-underline hover:border-accent hover:text-accent"
        >
          {numbers[s.id] ?? "•"}
          <span className="sr-only"> {t.evidence.sourceLabel(s.title ?? s.domain)}</span>
        </a>
      ))}
    </span>
  );
}

export function SourceMeta({ source }: { source: SourceRecord }) {
  const { t, locale } = useI18n();
  return (
    <span className="text-[12.5px] text-muted">
      {t.evidence.meta(
        source.domain,
        t.sourceTypes[source.sourceType],
        source.publishedAt ? formatDate(source.publishedAt, locale) : t.common.dateUnknown,
        formatDate(source.accessedAt, locale),
      )}
    </span>
  );
}

export function ClaimCard({ claim, sourcesById }: { claim: ClaimRow; sourcesById: Record<string, SourceRecord> }) {
  const { t, locale } = useI18n();
  return (
    <article className="rounded-md border border-line bg-paper-raised px-4 py-3">
      <p dir="auto" className="text-[15px] leading-relaxed text-ink">{claim.claimText}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ConfidenceBadge label={claim.confidenceLabel} rationale={claim.confidenceRationale} />
        <Badge tone={claim.verificationStatus === "conflicting" ? "danger" : "neutral"}>{t.evidence.verification[claim.verificationStatus]}</Badge>
        <Badge>{t.evidence.types[claim.evidenceType]}</Badge>
        {claim.temporalStatus !== "unknown" && <Badge>{claim.temporalStatus === "current" ? t.evidence.current : t.evidence.historical}</Badge>}
        {claim.lastObservedDate && <span className="text-[12px] text-muted">{t.evidence.latestSource(formatDate(claim.lastObservedDate, locale))}</span>}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        <span className="font-medium text-ink-soft">{t.evidence.whyLabel}</span>
        <span dir="auto">{claim.confidenceRationale}</span>
      </p>
      {claim.limitations && <p dir="auto" className="mt-1 text-[13px] text-low">{claim.limitations}</p>}
      <details className="group mt-2">
        <summary className="cursor-pointer select-none text-[13px] font-medium text-accent hover:underline">{t.evidence.evidenceCount(claim.evidence.length)}</summary>
        <ul className="mt-2 space-y-2">
          {claim.evidence.map((e) => {
            const source = sourcesById[e.sourceId];
            return (
              <li key={e.id} className="border-s-2 border-line-strong ps-3">
                <blockquote dir="auto" className="text-[13.5px] italic text-ink-soft">“{e.supportingExcerpt}”</blockquote>
                <div className="mt-1 text-[13px]">{source ? <ExternalSourceLink source={source} /> : <span className="text-muted">{t.evidence.sourceRemoved}</span>}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px] text-muted">
                  {source && <SourceMeta source={source} />}
                  <span>· {t.evidence.relationship[e.relationship]}</span>
                  <span>· {t.evidence.support(t.evidence.strength[e.supportStrength])}</span>
                  <span>· {t.evidence.credibility[e.sourceCredibility]}</span>
                </div>
                {e.notes && <p dir="auto" className="mt-0.5 text-[12px] text-muted">{e.notes}</p>}
              </li>
            );
          })}
        </ul>
      </details>
    </article>
  );
}
