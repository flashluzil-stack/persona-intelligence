import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SECTION_LABELS, type ProfileSectionType } from "@/lib/ai/schemas";
import type { ClaimRow, QualityReport, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/format";
import { Card, EmptyState, Notice } from "@/components/ui/primitives";
import { QualitySummary } from "@/components/research/quality-summary";
import { SectionActions } from "./actions";
import { ClaimsExplorer, SourcesExplorer } from "./explorers";
import { SectionContent, type EvidenceContext } from "./sections";

export const PROFILE_TABS: Array<{ id: string; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "background", label: "Background" },
  { id: "interests", label: "Interests" },
  { id: "communication", label: "Communication" },
  { id: "visual_style", label: "Visual style" },
  { id: "values", label: "Values & ideas" },
  { id: "relationships", label: "Relationships" },
  { id: "recent", label: "Recent" },
  { id: "open_questions", label: "Open questions" },
  { id: "evidence", label: "Evidence" },
  { id: "sources", label: "Sources" },
  { id: "quality", label: "Research quality" },
];

export interface ProfileViewData {
  sections: SectionRow[];
  claims: ClaimRow[];
  sources: SourceRecord[];
  quality: QualityReport | null;
}

export function sourceNumbers(sources: SourceRecord[]): Map<string, number> {
  const ordered = [...sources.filter((s) => s.relevance !== "unrelated"), ...sources.filter((s) => s.relevance === "unrelated")];
  return new Map(ordered.map((s, i) => [s.id, i + 1]));
}

export function ProfileTabs({ base, active, extraTabs = [] }: { base: string; active: string; extraTabs?: Array<{ id: string; label: string }> }) {
  const tabs = [...extraTabs.filter((t) => t.id === "workspace"), ...PROFILE_TABS, ...extraTabs.filter((t) => t.id !== "workspace")];
  return (
    <nav aria-label="Profile sections" className="no-print -mx-5 overflow-x-auto border-b border-line px-5">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => (
          <li key={t.id}>
            <Link
              href={`${base}?tab=${t.id}`}
              aria-current={active === t.id ? "page" : undefined}
              className={cn(
                "inline-block border-b-2 px-3 py-2.5 text-[14px] transition-colors",
                active === t.id ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ProfileSearchBox({ base, defaultValue }: { base: string; defaultValue?: string }) {
  return (
    <form action={base} method="get" role="search" className="no-print relative w-full max-w-xs">
      <input type="hidden" name="tab" value="evidence" />
      <label htmlFor="profile-search" className="sr-only">
        Search within profile
      </label>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        id="profile-search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search this profile"
        className="h-9 w-full rounded-md border border-line-strong bg-paper-raised ps-9 pe-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
      />
    </form>
  );
}

/**
 * Renders the selected profile tab. Used for live research and the fictional demo.
 * `editable` enables section editing/regeneration for live projects.
 */
export function ProfileTabContent({
  tab,
  data,
  query,
  editable,
}: {
  tab: string;
  data: ProfileViewData;
  query?: string;
  editable?: { projectId: string; aiConfigured: boolean } | null;
}): ReactNode {
  const numbers = sourceNumbers(data.sources);
  const ctx: EvidenceContext = {
    claimsById: new Map(data.claims.map((c) => [c.id, c])),
    sourcesById: new Map(data.sources.map((s) => [s.id, s])),
    numbers,
  };

  if (tab === "evidence") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-xl font-semibold">Evidence register</h2>
        <p className="mb-5 text-sm text-muted">Every claim was checked against the verbatim text of its cited sources. Confidence labels are assigned from the evidence, not by the AI.</p>
        <ClaimsExplorer claims={data.claims} sources={data.sources} initialQuery={query} />
      </Card>
    );
  }
  if (tab === "sources") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-xl font-semibold">Sources</h2>
        <p className="mb-5 text-sm text-muted">Original links, publication and access dates, and whether each page could be retrieved.</p>
        <SourcesExplorer sources={data.sources} numbers={Object.fromEntries(numbers)} />
      </Card>
    );
  }
  if (tab === "quality") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-semibold">Research quality</h2>
        {data.quality ? <QualitySummary quality={data.quality} /> : <EmptyState title="No quality report yet">A report is produced when a research run finishes.</EmptyState>}
      </Card>
    );
  }

  const section = data.sections.find((s) => s.sectionType === tab);
  const label = SECTION_LABELS[tab as ProfileSectionType] ?? "Section";
  if (!section) {
    return (
      <EmptyState title={`${label}: not generated`}>
        {data.claims.length === 0
          ? "This section needs AI analysis of the collected sources. It has not been generated for this research."
          : "This section has not been generated yet."}
      </EmptyState>
    );
  }
  const summary = (section.content as { summary?: string }).summary ?? "";
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{label}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Generated {formatDateTime(section.generatedAt)} · version {section.version}
            {typeof section.modelMetadata.model === "string" ? ` · ${section.modelMetadata.model}` : ""}
          </p>
        </div>
      </div>
      {editable && section.sectionType !== "visual_style" && section.sectionType !== "open_questions" && (
        <div className="mb-5">
          <SectionActions
            projectId={editable.projectId}
            sectionType={section.sectionType}
            currentOverride={section.userOverride}
            generatedSummary={summary}
            canRegenerate={editable.aiConfigured}
          />
        </div>
      )}
      <SectionContent section={section} ctx={ctx} />
    </Card>
  );
}

export function ResearchDisclaimer() {
  return (
    <Notice tone="info" className="no-print">
      Compiled from public sources only. It may be incomplete or out of date and is not a background check. Verify important facts yourself, and never use it for employment,
      credit, housing or insurance eligibility decisions.
    </Notice>
  );
}
