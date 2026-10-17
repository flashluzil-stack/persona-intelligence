import { Quote } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Notice } from "@/components/ui/primitives";
import type { StoredInterestTopic, StoredRecentItem, StoredValueItem, VisualStyleContent } from "@/lib/research/profile";
import type { ClaimRow, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { formatDate } from "@/lib/utils/format";
import { CitationChips, ExternalSourceLink } from "./evidence";

export interface EvidenceContext {
  claimsById: Map<string, ClaimRow>;
  sourcesById: Map<string, SourceRecord>;
  numbers: Map<string, number>;
}

type Cited = { text: string; claim_ids: string[] };

function sourcesForClaims(ids: string[], ctx: EvidenceContext): SourceRecord[] {
  const out: SourceRecord[] = [];
  for (const id of ids) {
    for (const e of ctx.claimsById.get(id)?.evidence ?? []) {
      const s = ctx.sourcesById.get(e.sourceId);
      if (s && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

function sourcesByIds(ids: string[], ctx: EvidenceContext): SourceRecord[] {
  return ids.map((id) => ctx.sourcesById.get(id)).filter((s): s is SourceRecord => Boolean(s));
}

function ClaimCite({ ids, ctx }: { ids: string[]; ctx: EvidenceContext }) {
  const worst = ids
    .map((id) => ctx.claimsById.get(id)?.confidenceLabel)
    .filter(Boolean)
    .sort((a, b) => ["high", "moderate", "low", "insufficient"].indexOf(b!) - ["high", "moderate", "low", "insufficient"].indexOf(a!))[0];
  return (
    <>
      <CitationChips sources={sourcesForClaims(ids, ctx)} numbers={ctx.numbers} />
      {worst && worst !== "high" && worst !== "moderate" && (
        <Badge tone={worst === "low" ? "low" : "insufficient"} className="ms-1 align-middle">
          {worst === "low" ? "Low confidence" : "Insufficient evidence"}
        </Badge>
      )}
    </>
  );
}

function CitedList({ items, ctx, title }: { items: Cited[] | undefined; ctx: EvidenceContext; title?: string }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-2">
      {title && <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</h3>}
      <ul className="space-y-1.5">
        {items.map((i, idx) => (
          <li key={idx} className="text-[15px] leading-relaxed text-ink">
            {i.text}
            <ClaimCite ids={i.claim_ids} ctx={ctx} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Limitations({ items }: { items: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-md border border-line bg-paper-sunken px-4 py-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Limitations</p>
      <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[13.5px] text-ink-soft">
        {items.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function InsufficientEvidence({ children }: { children: ReactNode }) {
  return <Notice tone="info" title="Insufficient evidence">{children}</Notice>;
}

export function SummaryBlock({ section }: { section: SectionRow }) {
  const summary = (section.content as { summary?: string }).summary;
  if (section.userOverride) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-accent/25 bg-accent-soft/60 px-4 py-3">
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">Edited by you · {formatDate(section.userOverrideAt)}</p>
          <p className="whitespace-pre-wrap text-[15.5px] leading-relaxed text-ink">{section.userOverride}</p>
        </div>
        {summary && (
          <details>
            <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">Show the generated summary</summary>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{summary}</p>
          </details>
        )}
      </div>
    );
  }
  return summary ? <p className="text-[16px] leading-relaxed text-ink">{summary}</p> : null;
}

export function SectionContent({ section, ctx }: { section: SectionRow; ctx: EvidenceContext }) {
  const c = section.content as Record<string, unknown>;
  switch (section.sectionType) {
    case "overview": {
      const role = c.current_role as Cited | null;
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          <div className="rounded-md border border-line px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Current role</p>
            {role ? (
              <p className="mt-1 text-[15px] text-ink">
                {role.text}
                <ClaimCite ids={role.claim_ids} ctx={ctx} />
              </p>
            ) : (
              <p className="mt-1 text-[15px] text-muted">Not verified as current from dated sources.</p>
            )}
          </div>
          <CitedList items={c.key_points as Cited[]} ctx={ctx} title="Key points" />
          <Limitations items={c.limitations as string[]} />
        </div>
      );
    }
    case "background": {
      const positions = (c.positions as Array<{ title: string; organization: string; period: string | null; status: string; claim_ids: string[] }>) ?? [];
      const empty = positions.length === 0 && !["education", "achievements", "publications", "projects"].some((k) => (c[k] as unknown[])?.length);
      return (
        <div className="space-y-6">
          <SummaryBlock section={section} />
          {empty && <InsufficientEvidence>No professional history could be verified from the available sources.</InsufficientEvidence>}
          {positions.length > 0 && (
            <div>
              <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Career timeline</h3>
              <ol className="relative space-y-4 border-s border-line-strong ps-5">
                {positions.map((p, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className={`absolute -start-[25px] top-1.5 size-2.5 rounded-full border-2 border-paper ${p.status === "current" ? "bg-accent" : "bg-line-strong"}`} />
                    <p className="text-[15px] font-medium text-ink">
                      {p.title} · <span className="font-normal">{p.organization}</span>
                      <ClaimCite ids={p.claim_ids} ctx={ctx} />
                    </p>
                    <p className="text-[13px] text-muted">
                      {p.period ?? "Dates not documented"} ·{" "}
                      {p.status === "current" ? "Current (verified)" : p.status === "historical" ? "Historical" : "Current status unknown"}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <CitedList items={c.education as Cited[]} ctx={ctx} title="Education & credentials" />
          <CitedList items={c.achievements as Cited[]} ctx={ctx} title="Achievements" />
          <CitedList items={c.publications as Cited[]} ctx={ctx} title="Published work" />
          <CitedList items={c.projects as Cited[]} ctx={ctx} title="Projects" />
        </div>
      );
    }
    case "interests": {
      const topics = (c.topics as StoredInterestTopic[]) ?? [];
      const max = Math.max(1, ...topics.map((t) => t.source_count));
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          {topics.length === 0 && <InsufficientEvidence>No recurring public topics could be identified.</InsufficientEvidence>}
          <ul className="space-y-3">
            {topics.map((t, i) => (
              <li key={i} className="rounded-md border border-line px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[15px] font-medium text-ink">{t.topic}</p>
                  {t.recurring ? <Badge tone="accent">Recurring · {t.source_count} sources</Badge> : <Badge tone="insufficient">Single mention</Badge>}
                </div>
                <p className="mt-1 text-[14px] text-ink-soft">{t.description}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-sunken" role="img" aria-label={`Found in ${t.source_count} sources`}>
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${(t.source_count / max) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[12px] text-muted">{t.most_recent_date ? `Most recent ${formatDate(t.most_recent_date)}` : "Undated"}</span>
                </div>
                <p className="mt-2 text-[13px] text-muted">
                  Representative sources
                  <CitationChips sources={sourcesByIds(t.source_ids, ctx)} numbers={ctx.numbers} />
                </p>
              </li>
            ))}
          </ul>
          <Limitations items={c.limitations as string[]} />
        </div>
      );
    }
    case "communication": {
      const observations = (c.observations as Array<{ dimension: string; observation: string; source_ids: string[] }>) ?? [];
      return (
        <div className="space-y-5">
          <Notice tone="info">Observations describe only publicly available writing or speech. They are not personality assessments.</Notice>
          <SummaryBlock section={section} />
          {observations.length === 0 && <InsufficientEvidence>No retrieved source contained enough of the person&apos;s own words to describe their public communication.</InsufficientEvidence>}
          <ul className="space-y-2">
            {observations.map((o, i) => (
              <li key={i} className="text-[15px] text-ink">
                <span className="me-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{o.dimension}</span>
                {o.observation}
                <CitationChips sources={sourcesByIds(o.source_ids, ctx)} numbers={ctx.numbers} />
              </li>
            ))}
          </ul>
          <Limitations items={c.limitations as string[]} />
        </div>
      );
    }
    case "visual_style":
      return (
        <Notice tone="info" title="Not available">
          {(c as unknown as VisualStyleContent).reason}
        </Notice>
      );
    case "values": {
      const items = (c.items as StoredValueItem[]) ?? [];
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          {items.length === 0 && <InsufficientEvidence>No explicitly stated values or principles were found.</InsufficientEvidence>}
          <ul className="space-y-3">
            {items.map((v, i) => {
              const source = ctx.sourcesById.get(v.source_id);
              return (
                <li key={i} className="rounded-md border border-line px-4 py-3">
                  {v.kind === "direct_quote" && v.quote ? (
                    <blockquote className="flex gap-2 text-[15.5px] italic leading-relaxed text-ink">
                      <Quote className="mt-1 size-4 shrink-0 text-faint" aria-hidden />“{v.quote}”
                    </blockquote>
                  ) : (
                    <p className="text-[15px] text-ink">{v.idea}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <Badge>{v.kind === "direct_quote" ? "Direct quote" : "Paraphrase"}</Badge>
                    {source && <ExternalSourceLink source={source} className="text-[13px]" />}
                  </div>
                  {v.note && <p className="mt-1 text-[12.5px] text-low">{v.note}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    case "relationships": {
      const items = (c.items as Array<{ counterpart: string; relationship: string; description: string; claim_ids: string[] }>) ?? [];
      return (
        <div className="space-y-5">
          <Notice tone="info">Only publicly documented professional relationships are listed. Social connections do not imply friendship, loyalty or trust.</Notice>
          <SummaryBlock section={section} />
          {items.length === 0 && <InsufficientEvidence>No documented professional relationships were found.</InsufficientEvidence>}
          <ul className="divide-y divide-line rounded-md border border-line">
            {items.map((r, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-[15px] font-medium text-ink">
                  {r.counterpart} <Badge className="ms-1 align-middle">{r.relationship.replace(/_/g, " ")}</Badge>
                </p>
                <p className="mt-0.5 text-[14px] text-ink-soft">
                  {r.description}
                  <ClaimCite ids={r.claim_ids} ctx={ctx} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "recent": {
      const items = (c.items as StoredRecentItem[]) ?? [];
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          {items.length === 0 && <InsufficientEvidence>No recent dated developments were found.</InsufficientEvidence>}
          <ul className="space-y-3">
            {items.map((r, i) => {
              const source = ctx.sourcesById.get(r.source_id);
              return (
                <li key={i} className="rounded-md border border-line px-4 py-3">
                  <p className="text-[15px] text-ink">{r.summary}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Published {r.published_at ? formatDate(r.published_at) : "— date unknown"}
                    {r.reported_event_date ? ` · Event date reported as ${r.reported_event_date}` : " · Event date not stated"}
                  </p>
                  <p className="mt-1.5 text-[14px] text-ink-soft">
                    <span className="font-medium">Why it may matter: </span>
                    {r.why_it_may_matter}
                  </p>
                  {source && (
                    <p className="mt-1.5 text-[13px]">
                      <ExternalSourceLink source={source} />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    case "open_questions": {
      const groups: Array<[string, string]> = [
        ["questions_to_ask", "Questions to ask directly"],
        ["missing_information", "Missing information"],
        ["conflicting_information", "Conflicting information"],
        ["needs_verification", "Needs independent verification"],
        ["insufficient_evidence_areas", "Too little evidence to conclude"],
      ];
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map(([key, label]) => {
            const items = (c[key] as string[]) ?? [];
            return (
              <div key={key} className="rounded-md border border-line px-4 py-3">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</h3>
                {items.length ? (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-[14.5px] text-ink">
                    {items.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[14px] text-muted">None noted.</p>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    default:
      return null;
  }
}
