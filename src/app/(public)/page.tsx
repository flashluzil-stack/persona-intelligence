import { ArrowRight, FileSearch, Fingerprint, Link2, ListChecks, Lock, ScanSearch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { CitationChips, ConfidenceBadge } from "@/components/profile/evidence";
import { PreviewForm } from "@/components/research/preview-form";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, Notice, SectionHeading } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";
import { getAuth } from "@/lib/auth";
import { getAccessConfig, getPublicConfig } from "@/lib/config";
import { DEMO_BRIEF, DEMO_CLAIMS, DEMO_PERSON, DEMO_SOURCES } from "@/lib/demo/fictional-profile";
import { sourceNumbers } from "@/lib/research/numbering";

const STEP_ICONS = [Fingerprint, ScanSearch, FileSearch, Link2, ListChecks];

export default async function LandingPage() {
  const { t, locale } = await getI18n();
  const l = t.landing;
  const cfg = getPublicConfig();
  const auth = await getAuth();
  const claims = DEMO_CLAIMS.slice(0, 3);
  const numbers = sourceNumbers(DEMO_SOURCES);
  const sourcesById = Object.fromEntries(DEMO_SOURCES.map((s) => [s.id, s]));
  const previewAvailable = cfg.searchConfigured && cfg.authConfigured;
  const lockedKeys = ["background", "interests", "communication", "evidence"] as const;

  return (
    <>
      <section className="border-b border-line">
        <PageContainer className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div className="space-y-7">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{l.eyebrow}</p>
            <h1 className="text-[36px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[52px]">
              {l.titleA} <span className="text-muted">{l.titleB}</span>
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-ink-soft">{l.intro}</p>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/demo" variant="secondary" size="lg">
                {l.viewSample}
              </LinkButton>
              <LinkButton href="/pricing" variant="ghost" size="lg">
                {l.seePricing} <ArrowRight className="rtl:rotate-180" aria-hidden />
              </LinkButton>
            </div>
            <p className="text-[13px] text-muted">{l.notMindReading}</p>
          </div>

          <Card id="preview" className="scroll-mt-24 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">{l.tryTitle}</h2>
            <p className="mb-5 mt-1 text-sm text-muted">{l.tryBody}</p>
            {!previewAvailable && (
              <Notice tone="demo" className="mb-4">
                {t.errors.searchNotConfigured}
              </Notice>
            )}
            <PreviewForm enabled={previewAvailable} turnstileSiteKey={getAccessConfig().turnstileSiteKey} signedIn={Boolean(auth)} />
          </Card>
        </PageContainer>
      </section>

      <section className="py-20">
        <PageContainer className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="space-y-5">
            <SectionHeading eyebrow={l.previewEyebrow} title={l.previewTitle} description={l.previewBody} />
            <ul className="grid gap-2 sm:grid-cols-2">
              {lockedKeys.map((k) => (
                <li key={k} className="flex items-start gap-2 rounded-md border border-line bg-paper-raised px-3 py-2.5 text-[13.5px]">
                  <Lock className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
                  {t.paywall.cards[k].title}
                </li>
              ))}
            </ul>
          </div>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-paper-sunken px-5 py-3">
              <p className="text-[13px] font-medium text-ink-soft">{l.sampleExcerpt}</p>
              <Badge tone="demo">{l.fictional}</Badge>
            </div>
            <div className="space-y-4 p-5" lang="en" dir="ltr">
              <div>
                <p className="font-display text-xl font-semibold">{DEMO_PERSON.name}</p>
                <p className="text-[13px] text-muted">{l.inventedLine}</p>
              </div>
              <ul className="space-y-3">
                {claims.map((c) => (
                  <li key={c.id} className="rounded-md border border-line px-3 py-2.5">
                    <p className="text-[14px] leading-snug">
                      {c.claimText}
                      <CitationChips sources={c.evidence.map((e) => sourcesById[e.sourceId]).filter(Boolean)} numbers={numbers} />
                    </p>
                    <div className="mt-1.5">
                      <ConfidenceBadge label={c.confidenceLabel} rationale={c.confidenceRationale} />
                      <span className="ms-2 text-[12px] text-muted">{c.confidenceRationale}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-line px-5 py-3">
              <Link href="/demo" className="inline-flex items-center gap-1 text-[14px] font-medium text-accent hover:underline">
                {l.openFullSample} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
              </Link>
              {locale !== "en" && <p className="mt-1 text-[12px] text-muted">{t.demo.sampleContentNote}</p>}
            </div>
          </Card>
        </PageContainer>
      </section>

      <section className="border-y border-line bg-paper-sunken py-20">
        <PageContainer className="space-y-10">
          <SectionHeading eyebrow={l.howEyebrow} title={l.howTitle} description={l.howBody} />
          <ol className="grid gap-4 md:grid-cols-5">
            {l.steps.map((s, i) => {
              const Icon = STEP_ICONS[i] ?? ListChecks;
              return (
                <li key={s.title} className="rounded-lg border border-line bg-paper-raised p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <Icon className="size-5 text-accent" aria-hidden />
                    <span className="font-mono text-[12px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="text-[16px] font-semibold leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
                </li>
              );
            })}
          </ol>
        </PageContainer>
      </section>

      <section className="py-20">
        <PageContainer className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <SectionHeading eyebrow={l.meetingEyebrow} title={l.meetingTitle} description={l.meetingBody} />
            <LinkButton href="/demo/brief" variant="secondary">
              {l.readSampleBrief}
            </LinkButton>
          </div>
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{l.sampleBriefLabel}</p>
              <Badge tone="demo">{l.fictional}</Badge>
            </div>
            <div lang="en" dir="ltr" className="space-y-4">
              <p className="font-display text-[17px] leading-relaxed">{DEMO_BRIEF.executive_summary}</p>
              <ol className="list-decimal space-y-1 ps-5 text-[14px] text-ink-soft">
                {DEMO_BRIEF.questions.slice(0, 3).map((q) => (
                  <li key={q.question}>{q.question}</li>
                ))}
              </ol>
            </div>
          </Card>
        </PageContainer>
      </section>

      <section className="border-t border-line py-20">
        <PageContainer className="grid gap-6 md:grid-cols-3">
          <div className="space-y-3 md:col-span-1">
            <ShieldCheck className="size-6 text-accent" aria-hidden />
            <h2 className="text-2xl font-semibold">{l.transparencyTitle}</h2>
          </div>
          <ul className="list-disc space-y-3 ps-5 text-[15px] leading-relaxed text-ink-soft md:col-span-2">
            {l.transparency.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </PageContainer>
      </section>

      <section className="border-t border-line py-20">
        <PageContainer className="grid gap-6 md:grid-cols-3">
          <h2 className="text-2xl font-semibold md:col-span-1">{l.limitationsTitle}</h2>
          <ul className="list-disc space-y-3 ps-5 text-[15px] leading-relaxed text-ink-soft md:col-span-2">
            {l.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </PageContainer>
      </section>
    </>
  );
}
