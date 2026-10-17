import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefView } from "@/components/brief/brief-view";
import { PageContainer } from "@/components/layout/site-chrome";
import { CopyButton, DeleteButton } from "@/components/profile/actions";
import { LinkButton } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth";
import { loadBriefBundle } from "@/lib/db/queries";
import { briefMarkdown } from "@/lib/export/markdown";
import { uuidSchema } from "@/lib/validation/schemas";
import { PrintButton } from "@/components/ui/print-button";

export const metadata: Metadata = { title: "Meeting brief" };

export default async function BriefPage({ params }: PageProps<"/research/[id]/briefs/[briefId]">) {
  const { id, briefId } = await params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(briefId).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/briefs/${briefId}`);
  const bundle = await loadBriefBundle(supabase, briefId);
  if (!bundle || bundle.brief.projectId !== id) notFound();
  const name = bundle.project.input.fullName;
  const markdown = briefMarkdown({ personName: name, objective: bundle.brief.objective, createdAt: bundle.brief.createdAt, brief: bundle.brief.brief, claims: bundle.claims, sources: bundle.sources });

  return (
    <PageContainer className="max-w-4xl space-y-6 py-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href={`/research/${id}`} className="hover:text-ink hover:underline">
            {name}
          </Link>{" "}
          /{" "}
          <Link href={`/research/${id}/meeting`} className="hover:text-ink hover:underline">
            Meeting preparation
          </Link>
        </nav>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={markdown} label="Copy as text" />
          <PrintButton />
          <LinkButton href={`/api/briefs/${briefId}/export`} size="sm" variant="secondary" prefetch={false}>
            <Download aria-hidden /> Download (.md)
          </LinkButton>
        </div>
      </div>
      <BriefView personName={name} objective={bundle.brief.objective} createdAt={bundle.brief.createdAt} brief={bundle.brief.brief} claims={bundle.claims} sources={bundle.sources} />
      <div className="no-print flex justify-between">
        <LinkButton href={`/research/${id}/meeting`} variant="ghost" size="sm">
          Generate another brief
        </LinkButton>
        <DeleteButton url={`/api/briefs/${briefId}`} redirectTo={`/research/${id}/meeting`} label="Delete brief" confirmText="Delete this meeting brief?" />
      </div>
    </PageContainer>
  );
}
