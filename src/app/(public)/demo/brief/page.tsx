import type { Metadata } from "next";
import { BriefView } from "@/components/brief/brief-view";
import { PageContainer } from "@/components/layout/site-chrome";
import { Notice } from "@/components/ui/primitives";
import { DEMO_BRIEF, DEMO_CLAIMS, DEMO_PERSON, DEMO_SOURCES } from "@/lib/demo/fictional-profile";

export const metadata: Metadata = { title: "Fictional sample meeting brief" };

export default function DemoBriefPage() {
  return (
    <PageContainer width="narrow" className="max-w-3xl space-y-6 py-10">
      <Notice tone="demo" title="Fictional demo — not real research">
        This brief describes an invented person. It shows the structure of a business partnership brief.
      </Notice>
      <BriefView
        personName={DEMO_PERSON.name}
        objective="Business partnership"
        createdAt="2026-10-02T08:15:00Z"
        brief={DEMO_BRIEF}
        claims={DEMO_CLAIMS}
        sources={DEMO_SOURCES}
      />
    </PageContainer>
  );
}
