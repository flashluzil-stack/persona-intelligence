import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefView } from "@/components/brief/brief-view";
import { PageContainer } from "@/components/layout/site-chrome";
import { CopyButton, DeleteButton } from "@/components/profile/actions";
import { LinkButton } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { requireUnlockedReport } from "@/lib/billing/gate";
import { loadBriefBundle } from "@/lib/db/queries";
import { briefMarkdown, objectiveLabel } from "@/lib/export/markdown";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meeting.breadcrumb };
}

export default async function BriefPage({ params }: PageProps<"/research/[id]/briefs/[briefId]">) {
  const { id, briefId } = await params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(briefId).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/briefs/${briefId}`);
  const { t } = await getI18n();
  const bundle = await loadBriefBundle(supabase, briefId);
  if (!bundle || bundle.brief.projectId !== id) notFound();
  await requireUnlockedReport(supabase, id);
  const name = bundle.project.input.fullName;
  const objective = objectiveLabel(bundle.brief.objective, t);
  const markdown = briefMarkdown({ personName: name, objective: bundle.brief.objective, createdAt: bundle.brief.createdAt, brief: bundle.brief.brief, claims: bundle.claims, sources: bundle.sources, t });

  return (
    <PageContainer className="max-w-4xl space-y-6 py-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t.common.breadcrumb} className="text-sm text-muted">
          <Link href={`/research/${id}`} className="hover:text-ink hover:underline">
            <bdi>{name}</bdi>
          </Link>{" "}
          /{" "}
          <Link href={`/research/${id}/meeting`} className="hover:text-ink hover:underline">
            {t.meeting.breadcrumb}
          </Link>
        </nav>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={markdown} label={t.actions.copyAsText} />
          <PrintButton label={t.common.print} />
          <LinkButton href={`/api/briefs/${briefId}/export`} size="sm" variant="secondary" prefetch={false}>
            <Download aria-hidden /> {t.brief.download}
          </LinkButton>
        </div>
      </div>
      <BriefView personName={name} objective={objective} createdAt={bundle.brief.createdAt} brief={bundle.brief.brief} claims={bundle.claims} sources={bundle.sources} />
      <div className="no-print flex justify-between gap-3">
        <LinkButton href={`/research/${id}/meeting`} variant="ghost" size="sm">
          {t.brief.another}
        </LinkButton>
        <DeleteButton url={`/api/briefs/${briefId}`} redirectTo={`/research/${id}/meeting`} label={t.brief.deleteBrief} confirmText={t.brief.deleteConfirm} />
      </div>
    </PageContainer>
  );
}
