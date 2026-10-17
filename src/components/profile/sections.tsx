"use client";

import { Quote } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Notice } from "@/components/ui/primitives";
import { formatDate } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";
import type { StoredInterestTopic, StoredRecentItem, StoredValueItem, VisualStyleContent } from "@/lib/research/profile";
import type { ClaimRow, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { CitationChips, ExternalSourceLink } from "./evidence";

/** Plain records (serializable from server to client components). */
export interface EvidenceContext {
  claimsById: Record<string, ClaimRow>;
  sourcesById: Record<string, SourceRecord>;
  numbers: Record<string, number>;
}

type Cited = { text: string; claim_ids: string[] };
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function sourcesForClaims(ids: string[], ctx: EvidenceContext): SourceRecord[] {
  const out: SourceRecord[] = [];
  for (const id of ids) {
    for (const e of ctx.claimsById[id]?.evidence ?? []) {
      const s = ctx.sourcesById[e.sourceId];
      if (s && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

const sourcesByIds = (ids: string[], ctx: EvidenceContext) => ids.map((id) => ctx.sourcesById[id]).filter((s): s is SourceRecord => Boolean(s));

const ORDER = ["high", "moderate", "low", "insufficient"] as const;

function ClaimCite({ ids, ctx }: { ids: string[]; ctx: EvidenceContext }) {
  const { t } = useI18n();
  const worst = ids
    .map((id) => ctx.claimsById[id]?.confidenceLabel)
    .filter((x): x is (typeof ORDER)[number] => Boolean(x))
    .sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0];
  return (
    <>
      <CitationChips sources={sourcesForClaims(ids, ctx)} numbers={ctx.numbers} />
      {(worst === "low" || worst === "insufficient") && (
        <Badge tone={worst === "low" ? "low" : "insufficient"} className="ms-1 align-middle">
          {t.evidence.confidence[worst]}
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
            <span dir="auto">{i.text}</span>
            <ClaimCite ids={i.claim_ids} ctx={ctx} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Limitations({ items }: { items: string[] | undefined }) {
  const { t } = useI18n();
  if (!items?.length) return null;
  return (
    <div className="rounded-md border border-line bg-paper-sunken px-4 py-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{t.sections.limitations}</p>
      <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[13.5px] text-ink-soft">
        {items.map((l, i) => (
          <li key={i} dir="auto">{l}</li>
        ))}
      </ul>
    </div>
  );
}

function Insufficient({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Notice tone="info" title={t.sections.insufficient}>
      {children}
    </Notice>
  );
}

export function SummaryBlock({ section }: { section: SectionRow }) {
  const { t, locale } = useI18n();
  const summary = (section.content as { summary?: string }).summary;
  if (section.userOverride) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-accent/25 bg-accent-soft/60 px-4 py-3">
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">{t.sections.editedByYou(formatDate(section.userOverrideAt, locale))}</p>
          <p dir="auto" className="whitespace-pre-wrap text-[15.5px] leading-relaxed text-ink">{section.userOverride}</p>
        </div>
        {summary && (
          <details>
            <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">{t.sections.showGenerated}</summary>
            <p dir="auto" className="mt-2 text-[15px] leading-relaxed text-ink-soft">{summary}</p>
          </details>
        )}
      </div>
    );
  }
  return summary ? <p dir="auto" className="text-[16px] leading-relaxed text-ink">{summary}</p> : null;
}

export function SectionContent({ section, ctx }: { section: SectionRow; ctx: EvidenceContext }) {
  const { t, locale } = useI18n();
  const c = section.content as Record<string, unknown>;
  const s = t.sections;
  switch (section.sectionType) {
    case "overview": {
      const role = c.current_role as Cited | null;
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          <div className="rounded-md border border-line px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{s.currentRole}</p>
            {role ? (
              <p className="mt-1 text-[15px] text-ink">
                <span dir="auto">{role.text}</span>
                <ClaimCite ids={role.claim_ids} ctx={ctx} />
              </p>
            ) : (
              <p className="mt-1 text-[15px] text-muted">{s.currentRoleUnverified}</p>
            )}
          </div>
          <CitedList items={arr<Cited>(c.key_points)} ctx={ctx} title={s.keyPoints} />
          <Limitations items={arr<string>(c.limitations)} />
        </div>
      );
    }
    case "background": {
      const positions = arr<{ title: string; organization: string; period: string | null; status: string; claim_ids: string[] }>(c.positions);
      const empty = positions.length === 0 && !["education", "achievements", "publications", "projects"].some((k) => arr(c[k]).length);
      return (
        <div className="space-y-6">
          <SummaryBlock section={section} />
          {empty && <Insufficient>{s.noBackground}</Insufficient>}
          {positions.length > 0 && (
            <div>
              <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{s.timeline}</h3>
              <ol className="relative space-y-4 border-s border-line-strong ps-5">
                {positions.map((p, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className={`absolute -start-[25px] top-1.5 size-2.5 rounded-full border-2 border-paper ${p.status === "current" ? "bg-accent" : "bg-line-strong"}`} />
                    <p className="text-[15px] font-medium text-ink">
                      <bdi>{p.title}</bdi> · <bdi className="font-normal">{p.organization}</bdi>
                      <ClaimCite ids={p.claim_ids} ctx={ctx} />
                    </p>
                    <p className="text-[13px] text-muted">
                      <bdi>{p.period ?? s.datesNotDocumented}</bdi> · {p.status === "current" ? s.currentVerified : p.status === "historical" ? s.historical : s.statusUnknown}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <CitedList items={arr<Cited>(c.education)} ctx={ctx} title={s.education} />
          <CitedList items={arr<Cited>(c.achievements)} ctx={ctx} title={s.achievements} />
          <CitedList items={arr<Cited>(c.publications)} ctx={ctx} title={s.publications} />
          <CitedList items={arr<Cited>(c.projects)} ctx={ctx} title={s.projects} />
        </div>
      );
    }
    case "interests": {
      const topics = arr<StoredInterestTopic>(c.topics);
      const max = Math.max(1, ...topics.map((x) => x.source_count));
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          {topics.length === 0 && <Insufficient>{s.noTopics}</Insufficient>}
          <ul className="space-y-3">
            {topics.map((topic, i) => (
              <li key={i} className="rounded-md border border-line px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p dir="auto" className="text-[15px] font-medium text-ink">{topic.topic}</p>
                  {topic.recurring ? <Badge tone="accent">{s.recurring(topic.source_count)}</Badge> : <Badge tone="insufficient">{s.singleMention}</Badge>}
                </div>
                <p dir="auto" className="mt-1 text-[14px] text-ink-soft">{topic.description}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-sunken" role="img" aria-label={s.foundIn(topic.source_count)}>
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${(topic.source_count / max) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[12px] text-muted">{topic.most_recent_date ? s.mostRecent(formatDate(topic.most_recent_date, locale)) : s.undated}</span>
                </div>
                <p className="mt-2 text-[13px] text-muted">
                  {s.representativeSources}
                  <CitationChips sources={sourcesByIds(topic.source_ids, ctx)} numbers={ctx.numbers} />
                </p>
              </li>
            ))}
          </ul>
          <Limitations items={arr<string>(c.limitations)} />
        </div>
      );
    }
    case "communication": {
      const observations = arr<{ dimension: keyof typeof s.dimensions; observation: string; source_ids: string[] }>(c.observations);
      return (
        <div className="space-y-5">
          <Notice tone="info">{s.commNotice}</Notice>
          <SummaryBlock section={section} />
          {observations.length === 0 && <Insufficient>{s.noComm}</Insufficient>}
          <ul className="space-y-2">
            {observations.map((o, i) => (
              <li key={i} className="text-[15px] text-ink">
                <span className="me-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{s.dimensions[o.dimension] ?? o.dimension}</span>
                <span dir="auto">{o.observation}</span>
                <CitationChips sources={sourcesByIds(o.source_ids, ctx)} numbers={ctx.numbers} />
              </li>
            ))}
          </ul>
          <Limitations items={arr<string>(c.limitations)} />
        </div>
      );
    }
    case "visual_style":
      return (
        <Notice tone="info" title={s.visualNotAvailable}>
          <span dir="auto">{(c as unknown as VisualStyleContent).reason}</span>
        </Notice>
      );
    case "values": {
      const items = arr<StoredValueItem>(c.items);
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          {items.length === 0 && <Insufficient>{s.noValues}</Insufficient>}
          <ul className="space-y-3">
            {items.map((v, i) => {
              const source = ctx.sourcesById[v.source_id];
              return (
                <li key={i} className="rounded-md border border-line px-4 py-3">
                  {v.kind === "direct_quote" && v.quote ? (
                    <blockquote dir="auto" className="flex gap-2 text-[15.5px] italic leading-relaxed text-ink">
                      <Quote className="mt-1 size-4 shrink-0 text-faint rtl:-scale-x-100" aria-hidden />“{v.quote}”
                    </blockquote>
                  ) : (
                    <p dir="auto" className="text-[15px] text-ink">{v.idea}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <Badge>{v.kind === "direct_quote" ? s.directQuote : s.paraphrase}</Badge>
                    {source && <ExternalSourceLink source={source} className="text-[13px]" />}
                  </div>
                  {v.note && <p dir="auto" className="mt-1 text-[12.5px] text-low">{v.note}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    case "relationships": {
      const items = arr<{ counterpart: string; relationship: keyof typeof s.relationshipTypes; description: string; claim_ids: string[] }>(c.items);
      return (
        <div className="space-y-5">
          <Notice tone="info">{s.relNotice}</Notice>
          <SummaryBlock section={section} />
          {items.length === 0 && <Insufficient>{s.noRelationships}</Insufficient>}
          <ul className="divide-y divide-line rounded-md border border-line">
            {items.map((r, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-[15px] font-medium text-ink">
                  <bdi>{r.counterpart}</bdi> <Badge className="ms-1 align-middle">{s.relationshipTypes[r.relationship] ?? r.relationship}</Badge>
                </p>
                <p className="mt-0.5 text-[14px] text-ink-soft">
                  <span dir="auto">{r.description}</span>
                  <ClaimCite ids={r.claim_ids} ctx={ctx} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "recent": {
      const items = arr<StoredRecentItem>(c.items);
      return (
        <div className="space-y-5">
          <SummaryBlock section={section} />
          {items.length === 0 && <Insufficient>{s.noRecent}</Insufficient>}
          <ul className="space-y-3">
            {items.map((r, i) => {
              const source = ctx.sourcesById[r.source_id];
              return (
                <li key={i} className="rounded-md border border-line px-4 py-3">
                  <p dir="auto" className="text-[15px] text-ink">{r.summary}</p>
                  <p className="mt-1 text-[13px] text-muted">
                    {r.published_at ? s.published(formatDate(r.published_at, locale)) : s.publishedUnknown} · {r.reported_event_date ? s.eventDate(r.reported_event_date) : s.eventNotStated}
                  </p>
                  <p className="mt-1.5 text-[14px] text-ink-soft">
                    <span className="font-medium">{s.whyItMatters}</span>
                    <span dir="auto">{r.why_it_may_matter}</span>
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
      const groups = Object.keys(s.openQuestions) as Array<keyof typeof s.openQuestions>;
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((key) => {
            const items = arr<string>(c[key]);
            return (
              <div key={key} className="rounded-md border border-line px-4 py-3">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{s.openQuestions[key]}</h3>
                {items.length ? (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-[14.5px] text-ink">
                    {items.map((q, i) => (
                      <li key={i} dir="auto">{q}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[14px] text-muted">{s.noneNoted}</p>
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
