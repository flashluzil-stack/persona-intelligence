import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UnlockOptions } from "@/components/billing/unlock-options";
import { PageContainer } from "@/components/layout/site-chrome";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { getEntitlements, getReportAccess } from "@/lib/billing/entitlements";
import { getOffers } from "@/lib/billing/offers";
import { getAccessConfig, getPublicConfig } from "@/lib/config";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.paywall.unlockTitle };
}

export default async function UnlockPage({ params }: PageProps<"/research/[id]/unlock">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireAuth(`/research/${id}/unlock`);
  const { t, locale } = await getI18n();
  const { data: project } = await supabase.from("research_projects").select("id, input").eq("id", id).maybeSingle();
  if (!project) notFound();
  const access = await getReportAccess(supabase, id);
  if (access.full) redirect(`/research/${id}?tab=overview`);

  const [{ data: overview }, entitlements] = await Promise.all([
    supabase.from("profile_sections").select("id").eq("research_project_id", id).eq("section_type", "overview").eq("is_current", true).maybeSingle(),
    getEntitlements(supabase),
  ]);
  const cfg = getPublicConfig();
  const { offers, annualSavings } = getOffers(locale, cfg.paymentsConfigured);
  const name = (project.input as { fullName?: string }).fullName ?? "";
  const sub = entitlements.subscription;

  return (
    <PageContainer className="space-y-6 py-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href={`/research/${id}`} className="hover:text-ink hover:underline">
          <bdi>{name}</bdi>
        </Link>{" "}
        / {t.paywall.unlockTitle}
      </nav>
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{t.paywall.unlockFor(name)}</h1>
        <p className="text-sm text-muted">{t.paywall.chooseOption}</p>
      </div>
      <UnlockOptions
        projectId={id}
        ready={Boolean(overview)}
        guest={Boolean(user.is_anonymous)}
        paymentsEnabled={cfg.paymentsConfigured}
        credits={entitlements.credits}
        creditsPerReport={getAccessConfig().creditsPerReport}
        subscription={sub ? { grantsAccess: sub.grantsAccess, used: sub.usedThisPeriod, limit: sub.periodLimit } : null}
        offers={offers}
        annualSavings={annualSavings}
      />
    </PageContainer>
  );
}
