import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/site-chrome";
import { sourceNumbers } from "@/components/profile/profile-view";
import { SectionContent, type EvidenceContext } from "@/components/profile/sections";
import { Card, EmptyState } from "@/components/ui/primitives";
import { SECTION_LABELS, type ProfileSectionType } from "@/lib/ai/schemas";
import { requireAuth } from "@/lib/auth";
import { loadClaimsForJobs, loadProjectBundle, loadSectionHistory } from "@/lib/db/queries";
import { uuidSchema } from "@/lib/validation/schemas";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Version history" };

/** Compare historical versions of each profile section side by side. */
export default async function HistoryPage({ params, searchParams }: PageProps<"/research/[id]/history">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/history`);
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  const history = await loadSectionHistory(supabase, id);
  const sp = await searchParams;
  const types = [...new Set(history.map((h) => h.sectionType))] as ProfileSectionType[];
  const selectedType = (typeof sp.section === "string" && types.includes(sp.section as ProfileSectionType) ? sp.section : types[0]) as ProfileSectionType | undefined;
  const versions = history.filter((h) => h.sectionType === selectedType);
  const claims = await loadClaimsForJobs(supabase, id, [...new Set(versions.map((v) => v.jobId).filter((j): j is string => Boolean(j)))]);
  const ctx: EvidenceContext = {
    claimsById: new Map(claims.map((c) => [c.id, c])),
    sourcesById: new Map(bundle.sources.map((s) => [s.id, s])),
    numbers: sourceNumbers(bundle.sources),
  };

  return (
    <PageContainer width="wide" className="space-y-6 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href={`/research/${id}`} className="hover:text-ink hover:underline">
          {bundle.project.input.fullName}
        </Link>{" "}
        / Version history
      </nav>
      <h1 className="text-3xl font-semibold">Version history</h1>
      {types.length === 0 ? (
        <EmptyState title="No profile versions yet" />
      ) : (
        <>
          <nav aria-label="Sections" className="flex flex-wrap gap-2">
            {types.map((t) => (
              <Link
                key={t}
                href={`/research/${id}/history?section=${t}`}
                aria-current={t === selectedType ? "page" : undefined}
                className={`rounded-md border px-3 py-1.5 text-sm ${t === selectedType ? "border-ink bg-ink text-paper" : "border-line hover:bg-paper-sunken"}`}
              >
                {SECTION_LABELS[t]} ({history.filter((h) => h.sectionType === t).length})
              </Link>
            ))}
          </nav>
          <div className="grid gap-4 lg:grid-cols-2">
            {versions.map((v) => (
              <Card key={v.id} className="p-5">
                <p className="mb-3 text-[13px] text-muted">
                  Version {v.version} · {formatDateTime(v.generatedAt)} {v.isCurrent && <strong className="text-ink">· Current</strong>}
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
