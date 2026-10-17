"use client";

import { Coins, CreditCard, FileCheck2, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import type { ProductKey } from "@/lib/billing/catalog";
import type { Offer } from "@/lib/billing/offers";
import { apiRequest } from "@/lib/utils/client-api";
import { useCheckout } from "./use-checkout";

export interface UnlockOptionsProps {
  projectId: string;
  ready: boolean;
  guest: boolean;
  paymentsEnabled: boolean;
  credits: number;
  creditsPerReport: number;
  subscription: { grantsAccess: boolean; used: number; limit: number } | null;
  offers: Record<ProductKey, Offer>;
  annualSavings: number;
}

function Option({ icon, title, body, children }: { icon: ReactNode; title: string; body: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-accent" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-[16px] font-semibold">{title}</h3>
          <div className="text-[13.5px] text-muted">{body}</div>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">{children}</div>
    </Card>
  );
}

/** Unlock choices for one report. Entitlement checks are repeated on the server for every action. */
export function UnlockOptions(props: UnlockOptionsProps) {
  const { t } = useI18n();
  const p = t.paywall;
  const pr = t.pricing;
  const router = useRouter();
  const checkout = useCheckout();
  const [busy, setBusy] = useState<"credits" | "subscription" | null>(null);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const reportUrl = `/research/${props.projectId}?tab=overview`;
  const unlockUrl = `/research/${props.projectId}/unlock`;
  const authNext = `?next=${encodeURIComponent(unlockUrl)}`;
  const canPurchase = props.paymentsEnabled && !props.guest && props.ready;

  const unlock = async (method: "credits" | "subscription") => {
    setBusy(method);
    setMessage(null);
    const res = await apiRequest<{ message: string }>(`/api/reports/${props.projectId}/unlock`, "POST", { method });
    setBusy(null);
    if (!res.ok || !res.data) return setMessage({ tone: "danger", text: res.error ?? t.errors.saveFailed });
    setMessage({ tone: "success", text: res.data.message });
    router.push(reportUrl);
    router.refresh();
  };

  const buy = (product: ProductKey) =>
    checkout.start(product, { projectId: product === "single_report" ? props.projectId : undefined, next: product === "single_report" ? reportUrl : unlockUrl });

  const buyButton = (product: ProductKey, label: string, variant: "secondary" | "accent" | "primary" = "secondary") => {
    if (props.guest) {
      return (
        <LinkButton href={`/sign-up${authNext}`} size="sm" variant={variant}>
          {pr.signInToBuy}
        </LinkButton>
      );
    }
    return (
      <Button size="sm" variant={variant} disabled={!canPurchase || !props.offers[product].purchasable || checkout.pending !== null} onClick={() => buy(product)}>
        {checkout.pending === product ? t.checkout.opening : label}
      </Button>
    );
  };

  const hasCredits = props.credits >= props.creditsPerReport;
  const sub = props.subscription;
  const single = props.offers.single_report;

  return (
    <div className="space-y-5">
      {!props.ready && <Notice tone="info">{p.notReady}</Notice>}
      {props.guest && (
        <Notice tone="info">
          {p.signInRequired}{" "}
          <Link href={`/sign-up${authNext}`} className="font-medium underline">
            {t.nav.createAccount}
          </Link>{" "}
          ·{" "}
          <Link href={`/sign-in${authNext}`} className="font-medium underline">
            {t.nav.signIn}
          </Link>
        </Notice>
      )}
      {!props.paymentsEnabled && <Notice tone="warning">{p.paymentsUnavailable}</Notice>}
      {message && (
        <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </Notice>
      )}
      {checkout.error && (
        <Notice tone="danger" role="alert">
          {checkout.error.message}
        </Notice>
      )}

      {(hasCredits || sub?.grantsAccess) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {hasCredits && (
            <Option icon={<Coins className="size-5" />} title={p.useCredit(props.creditsPerReport, props.credits)} body={p.useCreditBody}>
              <Button size="sm" variant="accent" disabled={!props.ready || busy !== null} onClick={() => unlock("credits")}>
                {busy === "credits" ? p.working : p.unlockCta}
              </Button>
            </Option>
          )}
          {sub?.grantsAccess && (
            <Option icon={<Repeat className="size-5" />} title={p.useSubscription} body={p.useSubscriptionBody(sub.used, sub.limit)}>
              <Button size="sm" variant="accent" disabled={!props.ready || busy !== null || sub.used >= sub.limit} onClick={() => unlock("subscription")}>
                {busy === "subscription" ? p.working : p.unlockCta}
              </Button>
            </Option>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Option
          icon={<FileCheck2 className="size-5" />}
          title={p.buyReport}
          body={
            <>
              <span className="block font-display text-2xl text-ink">
                <bdi>{single.price}</bdi>
              </span>
              {p.buyReportBody}
            </>
          }
        >
          {buyButton("single_report", p.buyReport, hasCredits || sub?.grantsAccess ? "secondary" : "accent")}
        </Option>
        <Option
          icon={<Coins className="size-5" />}
          title={p.buyCredits}
          body={
            <>
              <span className="block">{p.buyCreditsBody}</span>
              <span className="mt-1 block text-ink-soft">
                {(["credits_small", "credits_large"] as const).map((k) => (
                  <span key={k} className="block">
                    <bdi>{props.offers[k].price}</bdi> · {pr.creditsPrice(props.offers[k].credits, props.offers[k].unitPrice ?? "")}
                  </span>
                ))}
              </span>
            </>
          }
        >
          {buyButton("credits_small", t.billingPanel.creditsBalance(props.offers.credits_small.credits))}
          {buyButton("credits_large", t.billingPanel.creditsBalance(props.offers.credits_large.credits))}
        </Option>
        <Option
          icon={<CreditCard className="size-5" />}
          title={p.subscribe}
          body={
            <>
              <span className="block">{p.subscribeBody}</span>
              <span className="mt-1 block text-ink-soft">
                <bdi>{props.offers.monthly.price}</bdi> {pr.perMonth} · <bdi>{props.offers.annual.price}</bdi> {pr.perYear}
                {props.annualSavings > 0 && <> ({pr.save(props.annualSavings)})</>}
              </span>
            </>
          }
        >
          {buyButton("monthly", pr.monthly)}
          {buyButton("annual", pr.yearly)}
        </Option>
      </div>
      <p className="text-[12.5px] text-muted">
        {t.checkout.providerName} {p.policyNote}{" "}
        <Link href="/terms" className="underline">
          {pr.policies}
        </Link>
      </p>
    </div>
  );
}
