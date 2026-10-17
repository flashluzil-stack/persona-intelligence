"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import type { ClaimRow } from "@/lib/research/store";
import type { SourceRecord, SourceType } from "@/lib/research/types";
import { isoDaysAgo } from "@/i18n/format";
import { ClaimCard, ExternalSourceLink, SourceMeta } from "./evidence";


const matches = (q: string, ...fields: Array<string | null | undefined>) =>
  !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));

export function ClaimsExplorer({ claims, sources, initialQuery = "" }: { claims: ClaimRow[]; sources: SourceRecord[]; initialQuery?: string }) {
  const { t } = useI18n();
  const x = t.explorers;
  const [query, setQuery] = useState(initialQuery);
  const [confidence, setConfidence] = useState("all");
  const [category, setCategory] = useState("all");
  const sourcesById = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s])), [sources]);

  const filtered = claims.filter(
    (c) =>
      (confidence === "all" || c.confidenceLabel === confidence) &&
      (category === "all" || c.category === category) &&
      matches(query, c.claimText, ...c.evidence.map((e) => e.supportingExcerpt)),
  );
  const conflictGroups = [...new Set(claims.map((c) => c.conflictGroup).filter(Boolean))] as string[];

  if (claims.length === 0) {
    return <EmptyState title={x.noClaimsTitle}>{x.noClaimsBody}</EmptyState>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">{x.searchEvidenceLabel}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={x.searchEvidence} className="ps-9" />
        </label>
        <label>
          <span className="sr-only">{x.filterConfidence}</span>
          <Select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            <option value="all">{x.allConfidence}</option>
            {(["high", "moderate", "low", "insufficient"] as const).map((c) => (
              <option key={c} value={c}>
                {t.evidence.confidence[c]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">{x.filterCategory}</span>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">{x.allCategories}</option>
            {[...new Set(claims.map((c) => c.category))].map((cat) => (
              <option key={cat} value={cat}>
                {x.categories[cat] ?? cat}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {conflictGroups.length > 0 && (
        <div className="rounded-md border border-danger/25 bg-danger-soft/50 px-4 py-3">
          <p className="text-sm font-medium text-ink">{x.conflictTitle}</p>
          <p className="text-[13px] text-ink-soft">{x.conflictBody}</p>
          <div className="mt-3 space-y-3">
            {conflictGroups.map((g) => (
              <div key={g} className="grid gap-2 md:grid-cols-2">
                {claims
                  .filter((c) => c.conflictGroup === g)
                  .map((c) => (
                    <ClaimCard key={c.id} claim={c} sourcesById={sourcesById} />
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[13px] text-muted" aria-live="polite">
        {x.showingClaims(filtered.length, claims.length)}
      </p>
      <div className="space-y-3">
        {filtered.map((c) => (
          <ClaimCard key={c.id} claim={c} sourcesById={sourcesById} />
        ))}
      </div>
    </div>
  );
}

const RETRIEVAL_TONES: Record<SourceRecord["retrievalStatus"], "accent" | "neutral" | "moderate" | "danger"> = {
  retrieved: "accent",
  snippet_only: "neutral",
  not_permitted: "moderate",
  blocked: "danger",
  failed: "danger",
};

export function SourcesExplorer({ sources, numbers }: { sources: SourceRecord[]; numbers: Record<string, number> }) {
  const { t } = useI18n();
  const x = t.explorers;
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | SourceType>("all");
  const [period, setPeriod] = useState("any");
  const [showUnrelated, setShowUnrelated] = useState(false);

  const cutoff = period === "any" ? null : isoDaysAgo(Number(period), true);
  const filtered = sources.filter(
    (s) =>
      (showUnrelated || s.relevance !== "unrelated") &&
      (type === "all" || s.sourceType === type) &&
      (!cutoff || (s.publishedAt !== null && s.publishedAt >= cutoff)) &&
      matches(query, s.title, s.domain, s.excerpt),
  );
  const unrelatedCount = sources.filter((s) => s.relevance === "unrelated").length;

  if (sources.length === 0) return <EmptyState title={x.noSourcesTitle}>{x.noSourcesBody}</EmptyState>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">{x.searchSources}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={x.searchSources} className="ps-9" />
        </label>
        <label>
          <span className="sr-only">{x.filterType}</span>
          <Select value={type} onChange={(e) => setType(e.target.value as "all" | SourceType)}>
            <option value="all">{x.allTypes}</option>
            {[...new Set(sources.map((s) => s.sourceType))].map((st) => (
              <option key={st} value={st}>
                {t.sourceTypes[st]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">{x.filterDate}</span>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="any">{x.anyDate}</option>
            <option value="90">{x.last3m}</option>
            <option value="365">{x.last12m}</option>
            <option value="1095">{x.last3y}</option>
          </Select>
        </label>
      </div>
      {unrelatedCount > 0 && (
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={showUnrelated} onChange={(e) => setShowUnrelated(e.target.checked)} className="accent-[var(--accent)]" />
          {x.showUnrelated(unrelatedCount)}
        </label>
      )}
      <p className="text-[13px] text-muted" aria-live="polite">
        {x.showingSources(filtered.length, sources.length, period !== "any")}
      </p>
      <ol className="space-y-2.5">
        {filtered.map((s) => {
          
          return (
            <li key={s.id} id={`source-${s.id}`} className="rounded-md border border-line bg-paper-raised px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-sm border border-line bg-paper-sunken px-1.5 font-mono text-[11px] text-ink-soft">{numbers[s.id] ?? "–"}</span>
                <div className="min-w-0 flex-1">
                  <ExternalSourceLink source={s} className="text-[15px] font-medium" />
                  <div className="mt-0.5">
                    <SourceMeta source={s} />
                  </div>
                  {s.excerpt && <p dir="auto" className="mt-1.5 line-clamp-3 text-[13.5px] text-ink-soft">{s.excerpt}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={RETRIEVAL_TONES[s.retrievalStatus]}>{x.retrieval[s.retrievalStatus]}</Badge>
                    {s.relevance === "unrelated" && <Badge tone="danger">{x.differentPerson}</Badge>}
                    {s.relevance === "possibly_about_person" && <Badge tone="moderate">{x.possibly}</Badge>}
                    {s.relevance === "unassessed" && <Badge>{x.unassessed}</Badge>}
                  </div>
                  {s.retrievalNote && <p dir="auto" className="mt-1 text-[12.5px] text-muted">{s.retrievalNote}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
