export interface LegalDoc {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: Array<{ id: string; title: string; items: string[] }>;
}

export const privacyEn: LegalDoc = {
  eyebrow: "Privacy & ethics",
  title: "Privacy, ethical research and limitations",
  intro: "What Persona Intelligence does, what it refuses to do, how your data is handled, and the limits of what it can tell you.",
  updated: "Last updated: October 2026",
  sections: [
    {
      id: "what",
      title: "What Persona Intelligence is",
      items: [
        "A research and meeting-preparation tool that summarises publicly available, professionally relevant information about people and links every finding to its source.",
        "It is not a background check, a people-search service or a tool for evaluating anyone's character, honesty or worth.",
      ],
    },
    {
      id: "sources",
      title: "Which sources are used",
      items: [
        "Results from the configured web search provider (for example Brave Search or Tavily), plus the content of public pages where retrieval is permitted.",
        "Pages are retrieved only when the site's robots.txt allows it. Platforms that restrict automated access (such as LinkedIn, X, Facebook and Instagram) are never fetched; only the search snippet is used.",
        "Logins, paywalls, CAPTCHAs, rate limits and access controls are never bypassed. Pages that opt out of AI processing (meta robots “noai”) are not analysed.",
        "Coverage depends on the search provider. Nothing here claims complete coverage of the internet or of social media.",
      ],
    },
    {
      id: "never",
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
      id: "checks",
      title: "How findings are checked",
      items: [
        "The AI model can cite sources only by internal reference, so it cannot invent URLs. Every claim must quote its source word for word, and claims that cannot be matched to the stored text are discarded.",
        "Confidence labels (high, moderate, low, insufficient evidence) are assigned from the evidence itself, each with a stated reason. When sources conflict, both sides are shown with their dates.",
        "Retrieved web pages are treated as untrusted data. Instructions embedded in them are ignored.",
        "The free preview shows a genuine excerpt of the report. Locked sections are described by real counts from the report; unlocking never creates evidence that does not exist.",
      ],
    },
    {
      id: "data",
      title: "Your data",
      items: [
        "Reports, meeting briefs and private notes are visible only to your account. This is enforced on the server and by database row-level security.",
        "If you start a free preview without an account, a temporary guest account is created. When you sign in or create an account, its reports are moved to your account.",
        "Private notes are never sent to AI providers and are excluded from exports unless you choose to include them.",
        "The name, identifiers and meeting context you enter, and retrieved public content, are sent to the configured search and AI providers to perform the research.",
        "You can export all of your data or delete your account at any time from Settings. Reports are deleted automatically after your chosen retention period of inactivity (365 days by default).",
      ],
    },
    {
      id: "payments",
      title: "Payments",
      items: [
        "Payments are processed by Paddle, which acts as merchant of record and handles card details, taxes and invoices. Persona Intelligence never receives or stores card numbers.",
        "We store a record of each purchase (product, amount, status and the provider's transaction reference), your credit ledger and subscription status, so that unlocks and refunds can be audited.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      items: [
        "Strictly necessary cookies only: your sign-in session, your language choice (pi_locale) and, for guest previews, a signed reference to your guest session (pi_guest). No advertising or cross-site tracking cookies are used.",
        "If bot protection is enabled, Cloudflare Turnstile may process technical signals to verify that a request comes from a person.",
      ],
    },
    {
      id: "use",
      title: "Appropriate use",
      items: [
        "Use it to prepare for professional conversations: interviews, partnerships, client and investor meetings, negotiations and networking.",
        "Do not use it to harass, stalk or surveil anyone, or to make employment, credit, housing, insurance or other eligibility decisions.",
        "You remain responsible for verifying important facts and for your own decisions.",
      ],
    },
    {
      id: "compliance",
      title: "Compliance",
      items: [
        "These are the product's design principles, not a legal opinion. The operator of this deployment is responsible for its legal review (for example under GDPR, the Israeli Privacy Protection Law or other local law) and for honouring the terms of the providers it configures.",
      ],
    },
  ],
};

export const termsEn: LegalDoc = {
  eyebrow: "Terms",
  title: "Terms of use, acceptable use and purchases",
  intro: "The rules for using Persona Intelligence, and how single reports, credits and subscriptions work.",
  updated: "Last updated: October 2026",
  sections: [
    {
      id: "service",
      title: "The service",
      items: [
        "Persona Intelligence compiles publicly available, professionally relevant information into evidence-linked reports and meeting briefs.",
        "Reports can be incomplete, out of date or wrong. Every finding links to its source so you can check it. The service is not a background check and makes no guarantee of accuracy or completeness.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      items: [
        "Use the service only for legitimate professional preparation.",
        "You must not use it to harass, stalk, intimidate, surveil, dox or discriminate against anyone; to make employment, credit, housing, insurance or other eligibility decisions; to research children; or to infer sensitive characteristics.",
        "You must not attempt to bypass usage limits, free-preview limits, payment or access controls, or automate account creation.",
        "Accounts that break these rules may be suspended or closed.",
      ],
    },
    {
      id: "free",
      title: "Free previews",
      items: [
        "A free preview shows a short overview and selected sourced findings. The number of free previews is limited (for example one as a guest and a few per month with an account) and may change to prevent abuse.",
        "A free preview of a report remains available after you unlock it; unlocking adds the rest of the report.",
      ],
    },
    {
      id: "purchases",
      title: "Purchases",
      items: [
        "Prices are shown before checkout. Payments are processed by Paddle as merchant of record; applicable taxes are calculated at checkout and Paddle's buyer terms also apply.",
        "A purchase is only completed when the payment provider confirms it. Nothing is unlocked based on the browser alone.",
        "Single report: unlocks one specific report on your account, permanently, including future meeting briefs for that report within daily limits.",
        "Credits: one credit unlocks one completed report of your choice. Credits do not expire, are tied to your account and cannot be transferred or exchanged for cash. A credit is deducted only once per report, and only when the report is complete.",
        "Subscriptions (monthly or annual): unlock reports within the fair-use limit shown for your plan per billing period, renew automatically, and can be canceled at any time. After cancellation, access continues until the end of the paid period. Reports unlocked during a subscription stay unlocked.",
        "Plans are not unlimited. Fair-use limits are shown on the pricing page and in your account.",
      ],
    },
    {
      id: "failures",
      title: "Failed payments and research failures",
      items: [
        "If a payment fails, nothing is charged or unlocked; you can try again. If a subscription renewal fails, Paddle retries the payment and your plan is shown as “payment failed” in the meantime.",
        "Credits are only used on completed reports. If research fails before a report is produced, no credit or subscription allowance is used.",
      ],
    },
    {
      id: "refunds",
      title: "Refunds",
      items: [
        "Refund requests are handled through Paddle (use the receipt link or the billing portal in Settings). Where consumer law gives you a right to cancel, it applies.",
        "When a purchase is refunded: a refunded single report is locked again; the credits from a refunded credit pack are removed from your balance (if some were already used, your balance may become negative and later credit purchases first cover the difference); a refunded subscription ends.",
        "Chargebacks are treated like refunds.",
      ],
    },
    {
      id: "account",
      title: "Your account",
      items: [
        "Keep your sign-in details secure. You are responsible for activity on your account.",
        "You can export your data or delete your account at any time. Cancel an active subscription before deleting your account.",
      ],
    },
    {
      id: "liability",
      title: "Liability",
      items: [
        "The service is provided “as is”. To the extent permitted by law, the operator is not liable for decisions you make based on a report.",
        "These terms are a template prepared with the product and should be reviewed by the operator's legal counsel before commercial launch.",
      ],
    },
  ],
};
