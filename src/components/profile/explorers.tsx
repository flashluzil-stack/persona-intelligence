"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/primitives";
import type { ClaimRow } from "@/lib/research/store";
import { SOURCE_TYPE_LABELS, type SourceRecord, type SourceType } from "@/lib/research/types";
import { isoDaysAgo } from "@/lib/utils/format";
import { ClaimCard, ExternalSourceLink, SourceMeta } from "./evidence";

const CATEGORY_LABELS: Record<string, string> = {
  current_role: "Current role",
  past_role: "Past role",
  organization: "Organization",
  education: "Education",
  achievement: "Achievement",
  project: "Project",
  publication: "Publication",
  professional_relationship: "Relationship",
  interest_topic: "Interest",
  stated_value: "Stated value",
  public_statement: "Public statement",
  recent_development: "Recent development",
  location: "Location",
  other: "Other",
};

const matches = (q: string, ...fields: Array<string | null | undefined>) =>
  !q || fields.some((f) => f?.toLowerCase().includes(q.toLowerCase()));

export function ClaimsExplorer({ claims, sources, initialQuery = "" }: { claims: ClaimRow[]; sources: SourceRecord[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [confidence, setConfidence] = useState("all");
  const [category, setCategory] = useState("all");
  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const filtered = claims.filter(
    (c) =>
      (confidence === "all" || c.confidenceLabel === confidence) &&
      (category === "all" || c.category === category) &&
      matches(query, c.claimText, ...c.evidence.map((e) => e.supportingExcerpt)),
  );
  const conflictGroups = [...new Set(claims.map((c) => c.conflictGroup).filter(Boolean))] as string[];

  if (claims.length === 0) {
    return <EmptyState title="No verified claims">Claims appear here once sources have been analysed and every claim has been checked against its source text.</EmptyState>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search claims and evidence</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search within this profile’s evidence" className="ps-9" />
        </label>
        <label>
          <span className="sr-only">Filter by confidence</span>
          <Select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            <option value="all">All confidence levels</option>
            <option value="high">High confidence</option>
            <option value="moderate">Moderate confidence</option>
            <option value="low">Low confidence</option>
            <option value="insufficient">Insufficient evidence</option>
          </Select>
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {[...new Set(claims.map((c) => c.category))].map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat] ?? cat}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {conflictGroups.length > 0 && (
        <div className="rounded-md border border-danger/25 bg-danger-soft/50 px-4 py-3">
          <p className="text-sm font-medium text-ink">Conflicting information</p>
          <p className="text-[13px] text-ink-soft">Both sides are shown with their sources and dates. Neither has been silently chosen.</p>
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
        Showing {filtered.length} of {claims.length} claims
      </p>
      <div className="space-y-3">
        {filtered.map((c) => (
          <ClaimCard key={c.id} claim={c} sourcesById={sourcesById} />
        ))}
      </div>
    </div>
  );
}

const RETRIEVAL_LABELS: Record<SourceRecord["retrievalStatus"], { label: string; tone: "accent" | "neutral" | "moderate" | "danger" }> = {
  retrieved: { label: "Full page analysed", tone: "accent" },
  snippet_only: { label: "Snippet only", tone: "neutral" },
  not_permitted: { label: "Not permitted", tone: "moderate" },
  blocked: { label: "Blocked", tone: "danger" },
  failed: { label: "Retrieval failed", tone: "danger" },
};

export function SourcesExplorer({ sources, numbers }: { sources: SourceRecord[]; numbers: Record<string, number> }) {
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

  if (sources.length === 0) return <EmptyState title="No sources yet">Sources discovered by the research job will appear here with their original links.</EmptyState>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search sources</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sources" className="ps-9" />
        </label>
        <label>
          <span className="sr-only">Filter by source type</span>
          <Select value={type} onChange={(e) => setType(e.target.value as "all" | SourceType)}>
            <option value="all">All source types</option>
            {[...new Set(sources.map((s) => s.sourceType))].map((t) => (
              <option key={t} value={t}>
                {SOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">Filter by publication date</span>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="any">Any date</option>
            <option value="90">Last 3 months</option>
            <option value="365">Last 12 months</option>
            <option value="1095">Last 3 years</option>
          </Select>
        </label>
      </div>
      {unrelatedCount > 0 && (
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={showUnrelated} onChange={(e) => setShowUnrelated(e.target.checked)} className="accent-[var(--accent)]" />
          Show {unrelatedCount} source{unrelatedCount === 1 ? "" : "s"} judged to be about a different person
        </label>
      )}
      <p className="text-[13px] text-muted" aria-live="polite">
        Showing {filtered.length} of {sources.length} sources{period !== "any" ? " (undated sources hidden by the date filter)" : ""}
      </p>
      <ol className="space-y-2.5">
        {filtered.map((s) => {
          const r = RETRIEVAL_LABELS[s.retrievalStatus];
          return (
            <li key={s.id} id={`source-${s.id}`} className="rounded-md border border-line bg-paper-raised px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded-sm border border-line bg-paper-sunken px-1.5 font-mono text-[11px] text-ink-soft">{numbers[s.id] ?? "–"}</span>
                <div className="min-w-0 flex-1">
                  <ExternalSourceLink source={s} className="text-[15px] font-medium" />
                  <div className="mt-0.5">
                    <SourceMeta source={s} />
                  </div>
                  {s.excerpt && <p className="mt-1.5 line-clamp-3 text-[13.5px] text-ink-soft">{s.excerpt}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={r.tone}>{r.label}</Badge>
                    {s.relevance === "unrelated" && <Badge tone="danger">Different person</Badge>}
                    {s.relevance === "possibly_about_person" && <Badge tone="moderate">Possibly about this person</Badge>}
                    {s.relevance === "unassessed" && <Badge>Relevance not assessed</Badge>}
                  </div>
                  {s.retrievalNote && <p className="mt-1 text-[12.5px] text-muted">{s.retrievalNote}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
