import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/site-chrome";

export const metadata: Metadata = { title: "Privacy, ethics & limitations" };

const SECTIONS: Array<{ title: string; items: string[] }> = [
  {
    title: "What Persona Intelligence is",
    items: [
      "A research and meeting-preparation tool that summarises publicly available, professionally relevant information about people and links every finding to its source.",
      "It is not a background check, a people-search service or a tool for evaluating anyone's character, honesty or worth.",
    ],
  },
  {
    title: "Which sources are used",
    items: [
      "Results from the configured web search provider (for example Brave Search or Tavily), plus the content of public pages where retrieval is permitted.",
      "Pages are retrieved only when the site's robots.txt allows it. Platforms that restrict automated access (such as LinkedIn, X, Facebook and Instagram) are never fetched; only the search snippet is used.",
      "Logins, paywalls, CAPTCHAs, rate limits and access controls are never bypassed. Pages that opt out of AI processing (meta robots “noai”) are not analysed.",
      "Coverage depends on the search provider. Nothing here claims complete coverage of the internet or of social media.",
    ],
  },
  {
    title: "What is never collected or inferred",
    items: [
      "Private messages, leaked or stolen data, passwords or credentials, or private account content.",
      "Private contact details, home addresses or precise locations.",
      "Sensitive characteristics such as religion, political affiliation, ethnicity, sexuality, health or disability, whether stated directly or inferred from indirect clues.",
      "Facial recognition, biometric identification, or judgements about character, wealth or honesty based on appearance.",
      "Personality diagnoses, guesses about private thoughts, or trustworthiness scores.",
    ],
  },
  {
    title: "How findings are checked",
    items: [
      "The AI model can cite sources only by internal reference, so it cannot invent URLs. Every claim must quote its source word for word, and claims that can't be matched to the stored text are discarded.",
      "Confidence labels (high, moderate, low, insufficient evidence) are assigned from the evidence itself, and each comes with a stated reason. When sources conflict, both sides are shown with their dates.",
      "Retrieved web pages are treated as untrusted data. Instructions embedded in them are ignored.",
    ],
  },
  {
    title: "Your data",
    items: [
      "Research projects, meeting briefs and private notes are visible only to your account. This is enforced server-side and by database row-level security.",
      "Private notes are never sent to AI providers and are left out of exports unless you choose to include them.",
      "Inputs you provide (the name, identifiers, meeting context) and retrieved public content are sent to the configured search and AI providers to perform the research.",
      "You can export all of your data or delete your account at any time from Settings. Projects are deleted automatically after your chosen retention period of inactivity (365 days by default).",
    ],
  },
  {
    title: "Appropriate use",
    items: [
      "Use it to prepare for professional conversations: interviews, partnerships, client and investor meetings, negotiations and networking.",
      "Do not use it to harass, stalk or surveil anyone, or to make employment, credit, housing, insurance or other eligibility decisions.",
      "You remain responsible for verifying important facts and for your own decisions.",
    ],
  },
  {
    title: "Compliance",
    items: [
      "These are the product's design assumptions, not a legal opinion. Operators deploying Persona Intelligence are responsible for their own legal review (for example under GDPR, CCPA or local privacy law) and for honouring the terms of the providers they configure.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <PageContainer width="narrow" className="space-y-10 py-14">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Privacy &amp; ethics</p>
        <h1 className="text-4xl font-semibold">Privacy, ethical research and limitations</h1>
        <p className="text-[16px] text-ink-soft">What Persona Intelligence does, what it refuses to do, and the limits of what it can tell you.</p>
      </header>
      {SECTIONS.map((s) => (
        <section key={s.title} className="space-y-3">
          <h2 className="text-xl font-semibold">{s.title}</h2>
          <ul className="list-disc space-y-2 ps-5 text-[15px] leading-relaxed text-ink-soft">
            {s.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </PageContainer>
  );
}
