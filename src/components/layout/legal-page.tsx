import { PageContainer } from "@/components/layout/site-chrome";
import type { LegalDoc } from "@/i18n/legal";

/** Renders a legal/policy document with in-page anchors. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <PageContainer width="narrow" className="space-y-10 py-14">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{doc.eyebrow}</p>
        <h1 className="text-4xl font-semibold leading-tight">{doc.title}</h1>
        <p className="text-[16px] text-ink-soft">{doc.intro}</p>
        <p className="text-[13px] text-muted">{doc.updated}</p>
      </header>
      <nav aria-label={doc.title} className="rounded-lg border border-line bg-paper-raised p-4">
        <ol className="grid gap-1.5 text-[14px] sm:grid-cols-2">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-ink-soft hover:text-ink hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
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
