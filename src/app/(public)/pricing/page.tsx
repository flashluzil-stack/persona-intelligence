import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PricingCards } from "@/components/billing/pricing-cards";
import { PageContainer } from "@/components/layout/site-chrome";
import { LinkButton } from "@/components/ui/button";
import { Card, Notice, SectionHeading } from "@/components/ui/primitives";
import { formatMoney } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getAuth } from "@/lib/auth";
import { getCatalog } from "@/lib/billing/catalog";
import { getOffers } from "@/lib/billing/offers";
import { getAccessConfig, getPublicConfig } from "@/lib/config";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pricing.eyebrow };
}

export default async function PricingPage() {
  const { t, locale } = await getI18n();
  const p = t.pricing;
  const cfg = getPublicConfig();
  const access = getAccessConfig();
  const auth = await getAuth();
  const { offers, annualSavings } = getOffers(locale, cfg.paymentsConfigured);
  const monthly = getCatalog().monthly;

  return (
    <PageContainer className="space-y-14 py-14">
      <SectionHeading eyebrow={p.eyebrow} title={p.title} description={p.intro} className="mx-auto max-w-2xl text-center" />

      {!cfg.paymentsConfigured && <Notice tone="warning">{t.paywall.paymentsUnavailable}</Notice>}

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{p.freeTitle}</h2>
          <p className="text-[13.5px] text-muted">{p.freeDesc(access.freePreviewsPer30Days)}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[13.5px] text-ink-soft">
            {p.freeFeatures.map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <Check className="size-4 text-accent" aria-hidden /> {f}
              </li>
            ))}
          </ul>
        </div>
        <LinkButton href="/#preview" variant="primary" className="shrink-0">
          {p.cta.single}
        </LinkButton>
      </Card>

      <PricingCards
        offers={offers}
        annualSavings={annualSavings}
        monthlyAsYear={formatMoney(monthly.amountMinor * 12, monthly.currency, locale)}
        paymentsEnabled={cfg.paymentsConfigured}
        viewer={!auth ? "none" : auth.user.is_anonymous ? "guest" : "account"}
        subscriberDailyResearch={access.subscriberDailyResearch}
      />

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{p.includes}</h2>
          <ul className="space-y-2 text-[15px] text-ink-soft">
            {p.includeItems.map((i) => (
              <li key={i} className="flex gap-2">
                <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden /> {i}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 text-[14px] text-muted">
          <p>{p.notUnlimited}</p>
          <p>{t.checkout.providerName}</p>
          <p>{t.paywall.policyNote}</p>
          <p>{p.proposedNote}</p>
          <Link href="/terms#purchases" className="font-medium text-accent hover:underline">
            {p.policies}
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
