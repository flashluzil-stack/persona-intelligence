import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefForm } from "@/components/brief/brief-form";
import { PageContainer } from "@/components/layout/site-chrome";
import { Card, CardHeader, EmptyState, Notice } from "@/components/ui/primitives";
import { formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { requireUnlockedReport } from "@/lib/billing/gate";
import { getPublicConfig } from "@/lib/config";
import { loadProjectBundle } from "@/lib/db/queries";
import { objectiveLabel } from "@/lib/export/markdown";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meeting.breadcrumb };
}

export default async function MeetingPage({ params }: PageProps<"/research/[id]/meeting">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/meeting`);
  const { t, locale } = await getI18n();
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  await requireUnlockedReport(supabase, id);
  const cfg = getPublicConfig();
  const ready = ["completed", "partial"].includes(bundle.project.status) || bundle.claims.length > 0;
  const name = bundle.person?.displayName ?? bundle.project.input.fullName;
  const m = t.meeting;

  return (
    <PageContainer className="space-y-6 py-8">
      <nav aria-label={t.common.breadcrumb} className="text-sm text-muted">
        <Link href={`/research/${id}`} className="hover:text-ink hover:underline">
          <bdi>{name}</bdi>
        </Link>{" "}
        / {m.breadcrumb}
      </nav>
      <h1 className="text-3xl font-semibold">{m.title(name)}</h1>

      {!cfg.analysisConfigured && (
        <Notice tone="warning" title={m.aiMissingTitle}>
          {m.aiMissingBody}
        </Notice>
      )}
      {!ready && <Notice tone="info">{m.notReady}</Notice>}
      {ready && bundle.claims.length === 0 && <Notice tone="warning">{m.noClaims}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="min-w-0">
          <CardHeader title={m.newTitle} description={m.newBody} />
          <div className="p-5">
            <BriefForm projectId={id} defaultObjective={bundle.project.input.purpose} enabled={cfg.analysisConfigured && ready} />
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title={m.saved} />
          {bundle.briefs.length === 0 ? (
            <div className="p-5">
              <EmptyState title={m.noBriefsTitle}>{m.noBriefsBody}</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {bundle.briefs.map((b) => (
                <li key={b.id} className="px-5 py-3">
                  <Link href={`/research/${id}/briefs/${b.id}`} className="font-medium hover:underline">
                    {objectiveLabel(b.objective, t)}
                  </Link>
                  <p className="text-[13px] text-muted">{formatDateTime(b.createdAt, locale)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
