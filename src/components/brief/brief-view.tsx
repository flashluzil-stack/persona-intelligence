import { CheckSquare } from "lucide-react";
import type { ReactNode } from "react";
import { CitationChips, ExternalSourceLink, SourceMeta } from "@/components/profile/evidence";
import { sourceNumbers } from "@/components/profile/profile-view";
import { Card, Notice } from "@/components/ui/primitives";
import type { StoredMeetingBrief } from "@/lib/research/meeting";
import type { ClaimRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { formatDateTime } from "@/lib/utils/format";

function Block({ title, children, n }: { title: string; children: ReactNode; n: number }) {
  return (
    <section className="break-inside-avoid border-t border-line pt-5">
      <h2 className="mb-3 flex items-baseline gap-3 text-[19px] font-semibold">
        <span className="font-mono text-[12px] font-normal text-faint">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Structured meeting brief with source-linked findings. Shared by live briefs and the fictional demo. */
export function BriefView({
  personName,
  objective,
  createdAt,
  brief,
  claims,
  sources,
}: {
  personName: string;
  objective: string;
  createdAt: string;
  brief: StoredMeetingBrief;
  claims: ClaimRow[];
  sources: SourceRecord[];
}) {
  const claimsById = new Map(claims.map((c) => [c.id, c]));
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const cited = (ids: string[]) => {
    const out: SourceRecord[] = [];
    for (const id of ids) for (const e of claimsById.get(id)?.evidence ?? []) {
      const s = sourcesById.get(e.sourceId);
      if (s && !out.includes(s)) out.push(s);
    }
    return out;
  };
  const allCited = cited([
    ...brief.key_facts,
    ...brief.conversation_topics,
    ...brief.questions,
    ...brief.professional_overlap,
    ...brief.recent_developments,
    ...brief.documented_risks,
  ].flatMap((i) => i.claim_ids));
  const numbers = sourceNumbers(allCited);
  const Cite = ({ ids }: { ids: string[] }) => (ids.length ? <CitationChips sources={cited(ids)} numbers={numbers} /> : null);

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Meeting brief · {objective}</p>
        <h1 className="text-3xl font-semibold leading-tight">{personName}</h1>
        <p className="text-[13px] text-muted">Generated {formatDateTime(createdAt)}. You remain responsible for any decisions.</p>
      </header>
      {brief.evidence_note && <Notice tone="warning">{brief.evidence_note}</Notice>}

      <section>
        <p className="font-display text-[19px] leading-relaxed text-ink">{brief.executive_summary}</p>
      </section>

      <Block n={1} title="Key evidence-backed facts">
        <ul className="space-y-2">
          {brief.key_facts.map((f, i) => (
            <li key={i} className="text-[15px]">
              {f.fact}
              <Cite ids={f.claim_ids} />
            </li>
          ))}
          {brief.key_facts.length === 0 && <li className="text-sm text-muted">No sufficiently supported facts were available.</li>}
        </ul>
      </Block>

      <Block n={2} title="Conversation topics">
        <ul className="space-y-3">
          {brief.conversation_topics.map((t, i) => (
            <li key={i}>
              <p className="text-[15px] font-medium">
                {t.topic}
                <Cite ids={t.claim_ids} />
              </p>
              <p className="text-[14px] text-ink-soft">{t.rationale}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block n={3} title="Suggested questions">
        <ol className="list-decimal space-y-2 ps-5">
          {brief.questions.map((q, i) => (
            <li key={i} className="text-[15px]">
              {q.question}
              <Cite ids={q.claim_ids} />
              <p className="text-[13px] text-muted">{q.rationale}</p>
            </li>
          ))}
        </ol>
      </Block>

      <Block n={4} title="Potential professional overlap">
        <ul className="list-disc space-y-1.5 ps-5">
          {brief.professional_overlap.map((p, i) => (
            <li key={i} className="text-[15px]">
              {p.point}
              <Cite ids={p.claim_ids} />
            </li>
          ))}
          {brief.professional_overlap.length === 0 && <li className="list-none text-sm text-muted">None identified from the available evidence.</li>}
        </ul>
      </Block>

      <Block n={5} title="Relevant recent developments">
        <ul className="list-disc space-y-1.5 ps-5">
          {brief.recent_developments.map((r, i) => (
            <li key={i} className="text-[15px]">
              {r.summary}
              <Cite ids={r.claim_ids} />
            </li>
          ))}
          {brief.recent_developments.length === 0 && <li className="list-none text-sm text-muted">No dated recent developments were found.</li>}
        </ul>
      </Block>

      <Block n={6} title="Important unknowns to clarify">
        <ul className="list-disc space-y-1.5 ps-5 text-[15px]">
          {brief.unknowns_to_clarify.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      </Block>

      <Block n={7} title="Documented business risks">
        {brief.documented_risks.length ? (
          <ul className="list-disc space-y-1.5 ps-5">
            {brief.documented_risks.map((r, i) => (
              <li key={i} className="text-[15px]">
                {r.risk}
                <Cite ids={r.claim_ids} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No business risks are supported by documented evidence. This is not an assessment of the person.</p>
        )}
      </Block>

      <Block n={8} title="Suggested opening">
        <p className="border-s-2 border-accent ps-4 text-[15.5px] italic text-ink">{brief.suggested_opening}</p>
      </Block>

      <Block n={9} title="Pre-meeting checklist">
        <ul className="space-y-1.5">
          {brief.checklist.map((c, i) => (
            <li key={i} className="flex gap-2 text-[15px]">
              <CheckSquare className="mt-1 size-4 shrink-0 text-faint" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      </Block>

      <Block n={10} title="Sources for material claims">
        <ol className="space-y-2">
          {[...numbers.entries()].map(([id, n]) => {
            const s = sourcesById.get(id)!;
            return (
              <li key={id} className="flex gap-3 text-[14px]">
                <span className="shrink-0 font-mono text-[12px] text-faint">[{n}]</span>
                <div>
                  <ExternalSourceLink source={s} />
                  <div>
                    <SourceMeta source={s} />
                  </div>
                </div>
              </li>
            );
          })}
          {numbers.size === 0 && <li className="text-sm text-muted">No sources cited.</li>}
        </ol>
      </Block>
    </Card>
  );
}
