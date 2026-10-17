"use client";

import { Lock } from "lucide-react";
import { ClaimCard, ExternalSourceLink, SourceMeta } from "@/components/profile/evidence";
import { SectionContent } from "@/components/profile/sections";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, EmptyState, Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import type { LockedCard, LockedKey, PreviewData } from "@/lib/billing/preview";
import { evidenceContext } from "@/lib/research/numbering";

/**
 * Free preview of a report. Everything rendered here was selected on the
 * server by buildPreview(); locked sections are described only by genuine
 * counts. The blurred bars are an abstract placeholder, not hidden text.
 */
export function PreviewView({ preview, unlockHref, personName }: { preview: PreviewData; unlockHref: string; personName: string }) {
  const { t } = useI18n();
  const p = t.paywall;
  const ctx = evidenceContext(preview.claims, preview.sources);
  const sourceOrder = Object.entries(ctx.numbers).sort((a, b) => a[1] - b[1]);

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone="accent">{p.previewBadge}</Badge>
          <h2 className="text-xl font-semibold">{t.sectionLabels.overview}</h2>
        </div>
        <p className="mb-5 text-sm text-muted">{p.previewIntro}</p>
        {preview.overview ? (
          <SectionContent section={preview.overview} ctx={ctx} />
        ) : (
          <EmptyState title={t.sections.notGenerated(t.sectionLabels.overview)}>{t.sections.notGeneratedYet}</EmptyState>
        )}
      </Card>

      {preview.findings.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">{p.selectedFindings}</h2>
          <div className="space-y-3">
            {preview.findings.map((c) => (
              <ClaimCard key={c.id} claim={c} sourcesById={ctx.sourcesById} />
            ))}
          </div>
        </Card>
      )}

      {sourceOrder.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">{p.previewSources}</h2>
          <ol className="space-y-2">
            {sourceOrder.map(([id, n]) => {
              const s = ctx.sourcesById[id];
              return (
                <li key={id} className="flex gap-3 text-[14px]">
                  <span className="shrink-0 font-mono text-[12px] text-faint">[{n}]</span>
                  <div className="min-w-0">
                    <ExternalSourceLink source={s} />
                    <div>
                      <SourceMeta source={s} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <LockedCards locked={preview.locked} unlockHref={unlockHref} personName={personName} />
    </div>
  );
}

export function LockedCards({ locked, unlockHref, personName, only }: { locked: LockedCard[]; unlockHref: string; personName: string; only?: LockedKey }) {
  const { t } = useI18n();
  const p = t.paywall;
  const cards = only ? locked.filter((c) => c.key === only) : locked;
  return (
    <section aria-labelledby="locked-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="locked-title" className="text-xl font-semibold">
          {only ? p.unlockFor(personName) : p.lockedTitle}
        </h2>
        <p className="text-[13px] text-muted">{p.lockedHonesty}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <LockedCardView key={card.key} card={card} />
        ))}
      </ul>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <LinkButton href={unlockHref} variant="accent" size="lg">
          <Lock aria-hidden /> {p.unlockCta}
        </LinkButton>
      </div>
    </section>
  );
}

function LockedCardView({ card }: { card: LockedCard }) {
  const { t } = useI18n();
  const p = t.paywall;
  const meta = p.cards[card.key];
  const counts = card.counts
    .map((c) => {
      if (c.kind === "briefs") return p.counts.briefs;
      if (c.kind === "topics") return p.counts.topics(c.n ?? 0, c.m ?? 0);
      return p.counts[c.kind](c.n ?? 0);
    })
    .join(" · ");
  return (
    <li>
      <Card className="relative h-full overflow-hidden p-4" aria-label={p.lockedAria(meta.title)}>
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 space-y-1">
            <h3 className="text-[15px] font-semibold leading-snug">{meta.title}</h3>
            <p className="text-[13px] text-muted">{meta.desc}</p>
            <p className="text-[13px] font-medium text-ink-soft">
              {card.status === "missing" ? p.notGenerated : card.status === "limited" ? `${p.limitedEvidence} · ${counts}` : counts}
            </p>
          </div>
        </div>
        <div aria-hidden className="mt-3 space-y-1.5 blur-[3px] select-none">
          <div className="h-2 w-11/12 rounded bg-line-strong" />
          <div className="h-2 w-9/12 rounded bg-line-strong" />
          <div className="h-2 w-10/12 rounded bg-line" />
        </div>
      </Card>
    </li>
  );
}

export function LockedNotice({ unlockHref }: { unlockHref: string }) {
  const { t } = useI18n();
  return (
    <Notice tone="info" title={t.paywall.lockedTitle}>
      <span className="block">{t.errors.locked}</span>
      <LinkButton href={unlockHref} size="sm" variant="accent" className="mt-3">
        <Lock aria-hidden /> {t.paywall.unlockCta}
      </LinkButton>
    </Notice>
  );
}
