import { ArrowRight, FileSearch, Fingerprint, Link2, ListChecks, ScanSearch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/site-chrome";
import { CitationChips, ConfidenceBadge } from "@/components/profile/evidence";
import { sourceNumbers } from "@/components/profile/profile-view";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, SectionHeading } from "@/components/ui/primitives";
import { DEMO_BRIEF, DEMO_CLAIMS, DEMO_PERSON, DEMO_SOURCES } from "@/lib/demo/fictional-profile";

const STEPS = [
  { icon: Fingerprint, title: "Identify the right person", body: "You add a name and whatever identifiers you know. If several people match, you choose. Profiles are never merged automatically." },
  { icon: ScanSearch, title: "Search public sources", body: "Targeted queries through a configured search provider. Pages are retrieved only when the site allows it. Logins, paywalls and CAPTCHAs are never bypassed." },
  { icon: FileSearch, title: "Extract and verify claims", body: "Each claim must quote its source word for word. Claims that can't be matched to the source text are discarded." },
  { icon: Link2, title: "Label the evidence", body: "Confidence labels come from the number, independence and type of sources, and each label says why it was given. Conflicting sources are shown side by side." },
  { icon: ListChecks, title: "Prepare the conversation", body: "A meeting brief for your goal: facts, questions, topics and open unknowns, with every material point linked to its source." },
];

export default function LandingPage() {
  const claims = DEMO_CLAIMS.slice(0, 3);
  const numbers = sourceNumbers(DEMO_SOURCES);
  const sourcesById = new Map(DEMO_SOURCES.map((s) => [s.id, s]));
  return (
    <>
      <section className="border-b border-line">
        <PageContainer className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div className="space-y-7">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Public-source meeting intelligence</p>
            <h1 className="text-[40px] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[54px]">
              Know who you are meeting. <span className="text-muted">Prepare with evidence, not assumptions.</span>
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-ink-soft">
              See what someone has said and done in public, which professional interests come up again and again, and what to ask them. Every finding links to its
              original source, with an honest note of how strong the evidence is.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/sign-up" size="lg">
                Create an account <ArrowRight aria-hidden />
              </LinkButton>
              <LinkButton href="/demo" variant="secondary" size="lg">
                View a fictional sample profile
              </LinkButton>
            </div>
            <p className="text-[13px] text-muted">A research and decision-support tool. It does not read minds, diagnose personality or score trustworthiness.</p>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-paper-sunken px-5 py-3">
              <p className="text-[13px] font-medium text-ink-soft">Sample profile excerpt</p>
              <Badge tone="demo">Fictional demo</Badge>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="font-display text-xl font-semibold">{DEMO_PERSON.name}</p>
                <p className="text-[13px] text-muted">Invented person, organizations and sources</p>
              </div>
              <ul className="space-y-3">
                {claims.map((c) => (
                  <li key={c.id} className="rounded-md border border-line px-3 py-2.5">
                    <p className="text-[14px] leading-snug">
                      {c.claimText}
                      <CitationChips sources={c.evidence.map((e) => sourcesById.get(e.sourceId)!).filter(Boolean)} numbers={numbers} />
                    </p>
                    <div className="mt-1.5">
                      <ConfidenceBadge label={c.confidenceLabel} rationale={c.confidenceRationale} />
                      <span className="ms-2 text-[12px] text-muted">{c.confidenceRationale}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/demo" className="inline-flex items-center gap-1 text-[14px] font-medium text-accent hover:underline">
                Open the full fictional profile <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </Card>
        </PageContainer>
      </section>

      <section className="py-20">
        <PageContainer className="space-y-10">
          <SectionHeading eyebrow="How it works" title="A transparent research process" description="Each stage reports its status and saves what it finds, so you can see what was searched, what was found and what was missing." />
          <ol className="grid gap-4 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-lg border border-line bg-paper-raised p-5">
                <div className="mb-4 flex items-center justify-between">
                  <s.icon className="size-5 text-accent" aria-hidden />
                  <span className="font-mono text-[12px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="text-[16px] font-semibold leading-snug">{s.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </PageContainer>
      </section>

      <section className="border-y border-line bg-paper-sunken py-20">
        <PageContainer className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <SectionHeading eyebrow="Meeting intelligence" title="Briefs tailored to your objective" description="Choose a meeting type: job interview, investor meeting, partnership, sales, negotiation and more. The brief emphasises what matters for that goal and leaves out anything the evidence doesn't support." />
            <LinkButton href="/demo/brief" variant="secondary">
              Read a fictional sample brief
            </LinkButton>
          </div>
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Business partnership brief</p>
              <Badge tone="demo">Fictional demo</Badge>
            </div>
            <p className="font-display text-[17px] leading-relaxed">{DEMO_BRIEF.executive_summary}</p>
            <div>
              <p className="text-[13px] font-semibold text-ink">Suggested questions</p>
              <ol className="mt-1.5 list-decimal space-y-1 ps-5 text-[14px] text-ink-soft">
                {DEMO_BRIEF.questions.slice(0, 3).map((q) => (
                  <li key={q.question}>{q.question}</li>
                ))}
              </ol>
            </div>
          </Card>
        </PageContainer>
      </section>

      <section className="py-20">
        <PageContainer className="grid gap-6 md:grid-cols-3">
          <div className="space-y-3 md:col-span-1">
            <ShieldCheck className="size-6 text-accent" aria-hidden />
            <h2 className="text-2xl font-semibold">Source transparency &amp; privacy</h2>
          </div>
          <ul className="space-y-3 text-[15px] leading-relaxed text-ink-soft md:col-span-2">
            <li>• Only publicly accessible sources returned by the configured search provider are used. Pages are retrieved only where robots.txt and the platform allow it.</li>
            <li>• No private messages, leaked data, credentials, private contact details or precise locations. No facial recognition or biometric identification.</li>
            <li>• Sensitive characteristics (religion, politics, health, sexuality and the like) are never inferred, and appearance is never used as evidence of character.</li>
            <li>• Your projects and private notes are visible only to you, protected by database row-level security. Export or delete your data at any time.</li>
          </ul>
        </PageContainer>
      </section>

      <section className="border-t border-line py-20">
        <PageContainer className="grid gap-6 md:grid-cols-3">
          <h2 className="text-2xl font-semibold md:col-span-1">Limitations, plainly stated</h2>
          <ul className="space-y-3 text-[15px] leading-relaxed text-ink-soft md:col-span-2">
            <li>• Coverage is limited to what the search provider returns. Social networks and login-protected pages are not searched directly. Nothing guarantees complete or current information.</li>
            <li>• AI analysis can make mistakes. Claims are checked against source text, but you should verify important facts yourself.</li>
            <li>• Not a background check. Do not use it for employment, credit, housing, insurance or other eligibility decisions.</li>
          </ul>
        </PageContainer>
      </section>
    </>
  );
}
