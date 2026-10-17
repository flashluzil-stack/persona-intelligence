"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { QualitySummary } from "@/components/research/quality-summary";
import { Card, EmptyState, Notice } from "@/components/ui/primitives";
import { formatDateTime } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";
import type { ProfileSectionType } from "@/lib/ai/schemas";
import { evidenceContext } from "@/lib/research/numbering";
import type { ClaimRow, QualityReport, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { cn } from "@/lib/utils/cn";
import { SectionActions } from "./actions";
import { ClaimsExplorer, SourcesExplorer } from "./explorers";
import { SectionContent } from "./sections";

export const PROFILE_TAB_IDS = [
  "overview",
  "background",
  "interests",
  "communication",
  "visual_style",
  "values",
  "relationships",
  "recent",
  "open_questions",
  "evidence",
  "sources",
  "quality",
] as const;
export type ProfileTabId = (typeof PROFILE_TAB_IDS)[number];

export interface ProfileViewData {
  sections: SectionRow[];
  claims: ClaimRow[];
  sources: SourceRecord[];
  quality: QualityReport | null;
}

export function ProfileTabs({ base, active, extraTabs = [] }: { base: string; active: string; extraTabs?: Array<{ id: string; label: string }> }) {
  const { t } = useI18n();
  const tabs = [
    ...extraTabs.filter((x) => x.id === "workspace"),
    ...PROFILE_TAB_IDS.map((id) => ({ id, label: t.tabs[id] })),
    ...extraTabs.filter((x) => x.id !== "workspace"),
  ];
  return (
    <nav aria-label={t.project.tabsAria} className="no-print -mx-4 overflow-x-auto border-b border-line px-4 sm:-mx-5 sm:px-5">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              href={`${base}?tab=${tab.id}`}
              aria-current={active === tab.id ? "page" : undefined}
              className={cn(
                "inline-block border-b-2 px-3 py-2.5 text-[14px] transition-colors",
                active === tab.id ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ProfileSearchBox({ base, defaultValue }: { base: string; defaultValue?: string }) {
  const { t } = useI18n();
  return (
    <form action={base} method="get" role="search" className="no-print relative w-full sm:max-w-xs">
      <input type="hidden" name="tab" value="evidence" />
      <label htmlFor="profile-search" className="sr-only">
        {t.project.searchProfileLabel}
      </label>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        id="profile-search"
        name="q"
        dir="auto"
        defaultValue={defaultValue}
        placeholder={t.project.searchProfile}
        className="h-9 w-full rounded-md border border-line-strong bg-paper-raised ps-9 pe-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
      />
    </form>
  );
}

/** Renders one tab of a FULL report (only ever given data the viewer is entitled to). */
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
}) {
  const { t, locale } = useI18n();
  const ctx = evidenceContext(data.claims, data.sources);

  if (tab === "evidence") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-xl font-semibold">{t.sections.evidenceTitle}</h2>
        <p className="mb-5 text-sm text-muted">{t.sections.evidenceBody}</p>
        <ClaimsExplorer claims={data.claims} sources={data.sources} initialQuery={query} />
      </Card>
    );
  }
  if (tab === "sources") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 text-xl font-semibold">{t.sections.sourcesTitle}</h2>
        <p className="mb-5 text-sm text-muted">{t.sections.sourcesBody}</p>
        <SourcesExplorer sources={data.sources} numbers={ctx.numbers} />
      </Card>
    );
  }
  if (tab === "quality") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-semibold">{t.sections.qualityTitle}</h2>
        {data.quality ? <QualitySummary quality={data.quality} /> : <EmptyState title={t.sections.noQualityTitle}>{t.sections.noQualityBody}</EmptyState>}
      </Card>
    );
  }

  const section = data.sections.find((s) => s.sectionType === tab);
  const label = t.sectionLabels[tab as ProfileSectionType] ?? tab;
  if (!section) {
    return <EmptyState title={t.sections.notGenerated(label)}>{data.claims.length === 0 ? t.sections.needsAi : t.sections.notGeneratedYet}</EmptyState>;
  }
  const summary = (section.content as { summary?: string }).summary ?? "";
  const model = typeof section.modelMetadata.model === "string" ? ` · ${section.modelMetadata.model}` : "";
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">{label}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {t.sections.generatedMeta(formatDateTime(section.generatedAt, locale), section.version)}
          <bdi>{model}</bdi>
        </p>
      </div>
      {editable && section.sectionType !== "visual_style" && section.sectionType !== "open_questions" && (
        <div className="mb-5">
          <SectionActions projectId={editable.projectId} sectionType={section.sectionType} currentOverride={section.userOverride} generatedSummary={summary} canRegenerate={editable.aiConfigured} />
        </div>
      )}
      <SectionContent section={section} ctx={ctx} />
    </Card>
  );
}

export function ResearchDisclaimer() {
  const { t } = useI18n();
  return (
    <Notice tone="info" className="no-print">
      {t.project.disclaimer}
    </Notice>
  );
}
