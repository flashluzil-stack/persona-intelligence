import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefForm } from "@/components/brief/brief-form";
import { PageContainer } from "@/components/layout/site-chrome";
import { Card, CardHeader, EmptyState, Notice } from "@/components/ui/primitives";
import { requireAuth } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { loadProjectBundle } from "@/lib/db/queries";
import { uuidSchema } from "@/lib/validation/schemas";
import { formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Meeting preparation" };

export default async function MeetingPage({ params }: PageProps<"/research/[id]/meeting">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireAuth(`/research/${id}/meeting`);
  const bundle = await loadProjectBundle(supabase, id);
  if (!bundle) notFound();
  const cfg = getPublicConfig();
  const ready = ["completed", "partial"].includes(bundle.project.status) || bundle.claims.length > 0;
  const name = bundle.person?.displayName ?? bundle.project.input.fullName;

  return (
    <PageContainer className="space-y-6 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href={`/research/${id}`} className="hover:text-ink hover:underline">
          {name}
        </Link>{" "}
        / Meeting preparation
      </nav>
      <h1 className="text-3xl font-semibold">Prepare for your meeting with {name}</h1>

      {!cfg.analysisConfigured && (
        <Notice tone="warning" title="AI analysis is not configured">
          Meeting briefs need <code>OPENAI_API_KEY</code>. Nothing will be generated or simulated without it.
        </Notice>
      )}
      {!ready && <Notice tone="info">Finish the research first. Briefs are built only from verified claims.</Notice>}
      {ready && bundle.claims.length === 0 && (
        <Notice tone="warning">No verified claims are available for this person, so the brief will contain general preparation guidance only.</Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="New meeting brief" description="Tell us about the meeting. The brief adapts to your objective and cites its evidence." />
          <div className="p-5">
            <BriefForm projectId={id} defaultObjective={bundle.project.input.purpose} enabled={cfg.analysisConfigured && ready} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Saved briefs" />
          {bundle.briefs.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No briefs yet">Generated briefs are saved here.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {bundle.briefs.map((b) => (
                <li key={b.id} className="px-5 py-3">
                  <Link href={`/research/${id}/briefs/${b.id}`} className="font-medium hover:underline">
                    {b.objective}
                  </Link>
                  <p className="text-[13px] text-muted">{formatDateTime(b.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
