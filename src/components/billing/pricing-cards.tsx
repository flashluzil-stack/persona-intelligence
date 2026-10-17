"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, Card, Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import type { ProductKey } from "@/lib/billing/catalog";
import type { Offer } from "@/lib/billing/offers";
import { cn } from "@/lib/utils/cn";
import { useCheckout } from "./use-checkout";

export interface PricingCardsProps {
  offers: Record<ProductKey, Offer>;
  annualSavings: number;
  monthlyAsYear: string;
  paymentsEnabled: boolean;
  /** "account" = signed in with a permanent account; "guest" or "none" must sign up first. */
  viewer: "account" | "guest" | "none";
  freePreviewsPerMonth: number;
  subscriberDailyResearch: number;
}

export function PricingCards(props: PricingCardsProps) {
  const { t } = useI18n();
  const p = t.pricing;
  const [period, setPeriod] = useState<"month" | "year">("month");
  const checkout = useCheckout();
  const o = props.offers;

  const buy = (product: ProductKey, label: string, variant: "secondary" | "accent" | "primary" = "secondary") => {
    if (!props.paymentsEnabled || !o[product].purchasable) {
      return (
        <Button size="sm" variant={variant} disabled className="w-full">
          {p.unavailable}
        </Button>
      );
    }
    if (props.viewer !== "account") {
      return (
        <LinkButton href="/sign-up?next=/pricing" size="sm" variant={variant} className="w-full">
          {p.signInToBuy}
        </LinkButton>
      );
    }
    return (
      <Button size="sm" variant={variant} className="w-full" disabled={checkout.pending !== null} onClick={() => checkout.start(product, { next: "/dashboard" })}>
        {checkout.pending === product ? t.checkout.opening : label}
      </Button>
    );
  };

  const includes = (items: string[]) => (
    <ul className="space-y-1.5 text-[13.5px] text-ink-soft">
      {items.map((i) => (
        <li key={i} className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );

  const price = (value: string, suffix?: string) => (
    <p className="flex flex-wrap items-baseline gap-1">
      <bdi className="font-display text-[32px] font-semibold leading-none">{value}</bdi>
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </p>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <div role="radiogroup" aria-label={p.billingPeriod} className="inline-flex rounded-md border border-line-strong bg-paper-raised p-1">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={period === value}
              onClick={() => setPeriod(value)}
              className={cn("rounded px-4 py-1.5 text-sm transition-colors", period === value ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}
            >
              {value === "month" ? p.monthly : p.yearly}
              {value === "year" && props.annualSavings > 0 && <span className="ms-1.5 text-[12px] opacity-80">({p.save(props.annualSavings)})</span>}
            </button>
          ))}
        </div>
      </div>

      {checkout.error && (
        <Notice tone="danger" role="alert">
          {checkout.error.message}
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col gap-4 p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{p.products.single_report.name}</h2>
            <p className="text-[13.5px] text-muted">{p.products.single_report.desc}</p>
          </div>
          {price(o.single_report.price, p.perReport)}
          <p className="text-[13px] text-muted">{p.oneTime}</p>
          <div className="mt-auto">
            <LinkButton href="/#preview" size="sm" variant="secondary" className="w-full">
              {p.cta.single}
            </LinkButton>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{p.products.credits.name}</h2>
            <p className="text-[13.5px] text-muted">{p.products.credits.desc}</p>
          </div>
          <ul className="space-y-3">
            {(["credits_small", "credits_large"] as const).map((k) => (
              <li key={k} className="space-y-1.5 rounded-md border border-line p-3">
                {price(o[k].price)}
                <p className="text-[13px] text-muted">{p.creditsPrice(o[k].credits, o[k].unitPrice ?? "")}</p>
                {buy(k, p.cta.credits)}
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-muted">{p.neverExpire}</p>
        </Card>

        <Card className={cn("flex flex-col gap-4 p-5", period === "month" && "border-ink")}>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{p.products.monthly.name}</h2>
            <p className="text-[13.5px] text-muted">{p.products.monthly.desc}</p>
          </div>
          {period === "month" ? price(o.monthly.price, p.perMonth) : price(props.monthlyAsYear, p.perYear)}
          {includes([p.fairUse(o.monthly.reportsPerPeriod ?? 0), p.researchRuns(props.subscriberDailyResearch)])}
          <p className="text-[13px] text-muted">{p.renewal}</p>
          <div className="mt-auto">
            {buy("monthly", p.cta.subscribe, period === "month" ? "accent" : "secondary")}
          </div>
        </Card>

        <Card className={cn("flex flex-col gap-4 p-5", period === "year" && "border-ink")}>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{p.products.annual.name}</h2>
              <p className="text-[13.5px] text-muted">{p.products.annual.desc}</p>
            </div>
            {props.annualSavings > 0 && <Badge tone="high">{p.save(props.annualSavings)}</Badge>}
          </div>
          {period === "year" ? price(o.annual.price, p.perYear) : price(o.annual.unitPrice ?? "", p.perMonth)}
          <p className="text-[13px] text-muted">{period === "year" ? p.effectiveMonthly(o.annual.unitPrice ?? "") : p.billedAnnually(o.annual.price)}</p>
          {includes([p.fairUseYear(o.annual.reportsPerPeriod ?? 0), p.researchRuns(props.subscriberDailyResearch)])}
          <p className="text-[13px] text-muted">{p.renewal}</p>
          <div className="mt-auto">
            {buy("annual", p.cta.subscribe, period === "year" ? "accent" : "secondary")}
          </div>
        </Card>
      </div>
    </div>
  );
}
