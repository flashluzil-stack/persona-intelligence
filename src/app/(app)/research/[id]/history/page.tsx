import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/site-chrome";
import { SectionContent } from "@/components/profile/sections";
import { Card, EmptyState } from "@/components/ui/primitives";
import { formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import type { ProfileSectionType } from "@/lib/ai/schemas";
import { requireAuth } from "@/lib/auth";
import { requireUnlockedReport } from "@/lib/billing/gate";
import { loadClaimsForJobs, loadProjectBundle, loadSectionHistory } from "@/lib/db/queries";
import { evidenceContext } from "@/lib/research/numbering";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.history.title };
}

/** Compare historical versions of each profile section side by side. */
export default async function HistoryPage({ params, searchParams }: PageProps<"/research/[id]/history">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/history`);
  const { t, locale } = await getI18n();
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  await requireUnlockedReport(supabase, id);
  const history = await loadSectionHistory(supabase, id);
  const sp = await searchParams;
  const types = [...new Set(history.map((h) => h.sectionType))] as ProfileSectionType[];
  const selectedType = (typeof sp.section === "string" && types.includes(sp.section as ProfileSectionType) ? sp.section : types[0]) as ProfileSectionType | undefined;
  const versions = history.filter((h) => h.sectionType === selectedType);
  const claims = await loadClaimsForJobs(supabase, id, [...new Set(versions.map((v) => v.jobId).filter((j): j is string => Boolean(j)))]);
  const ctx = evidenceContext(claims, bundle.sources);

  return (
    <PageContainer width="wide" className="space-y-6 py-8">
      <nav aria-label={t.common.breadcrumb} className="text-sm text-muted">
        <Link href={`/research/${id}`} className="hover:text-ink hover:underline">
          <bdi>{bundle.project.input.fullName}</bdi>
        </Link>{" "}
        / {t.history.title}
      </nav>
      <h1 className="text-3xl font-semibold">{t.history.title}</h1>
      {types.length === 0 ? (
        <EmptyState title={t.history.none} />
      ) : (
        <>
          <nav aria-label={t.history.sectionsAria} className="flex flex-wrap gap-2">
            {types.map((type) => (
              <Link
                key={type}
                href={`/research/${id}/history?section=${type}`}
                aria-current={type === selectedType ? "page" : undefined}
                className={`rounded-md border px-3 py-1.5 text-sm ${type === selectedType ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-sunken"}`}
              >
                {t.sectionLabels[type]} ({history.filter((h) => h.sectionType === type).length})
              </Link>
            ))}
          </nav>
          <div className="grid gap-4 lg:grid-cols-2">
            {versions.map((v) => (
              <Card key={v.id} className="min-w-0 p-5">
                <p className="mb-3 text-[13px] text-muted">
                  {t.history.meta(v.version, formatDateTime(v.generatedAt, locale))} {v.isCurrent && <strong className="text-ink">{t.history.current}</strong>}
                </p>
                <SectionContent section={v} ctx={ctx} />
              </Card>
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}
