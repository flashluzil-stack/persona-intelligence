"use client";

import { useEffect, useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import { apiRequest } from "@/lib/utils/client-api";

type Status = "pending" | "paid" | "failed" | "canceled" | "refunded";
const POLL_MS = 2000;
const MAX_POLLS = 45;

/**
 * Post-checkout page. It only reflects server state: a purchase becomes "paid"
 * when the signed Paddle webhook has been verified and applied.
 */
export function PurchaseStatus({ purchaseId, next }: { purchaseId: string; next: string | null }) {
  const { t } = useI18n();
  const c = t.checkout;
  const [state, setState] = useState<{ status: Status | "missing"; projectId: string | null; kind: string | null }>({ status: "pending", projectId: null, kind: null });
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (state.status !== "pending" || polls >= MAX_POLLS) return;
    const timer = setTimeout(async () => {
      const res = await apiRequest<{ status: Status; projectId: string | null; kind: string }>(`/api/billing/purchases/${purchaseId}`, "GET");
      if (res.status === 404) setState({ status: "missing", projectId: null, kind: null });
      else if (res.ok && res.data) setState({ status: res.data.status, projectId: res.data.projectId, kind: res.data.kind });
      setPolls((n) => n + 1);
    }, polls === 0 ? 300 : POLL_MS);
    return () => clearTimeout(timer);
  }, [purchaseId, polls, state.status]);

  const target = state.projectId ? `/research/${state.projectId}?tab=overview` : next ?? "/dashboard";

  if (state.status === "paid") {
    return (
      <div className="space-y-4" role="status">
        <Notice tone="success" title={c.confirmedTitle}>
          {c.confirmedBody}
        </Notice>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={target} variant="accent">
            {state.projectId || next?.startsWith("/research/") ? c.goToReport : c.goToDashboard}
          </LinkButton>
          <LinkButton href="/dashboard" variant="ghost">
            {c.goToDashboard}
          </LinkButton>
        </div>
      </div>
    );
  }
  if (state.status !== "pending") {
    return (
      <div className="space-y-4">
        <Notice tone="danger" role="alert" title={c.failedTitle}>
          {state.status === "missing" ? t.errors.notFound : c.failedBody}
        </Notice>
        <LinkButton href={next ?? "/pricing"} variant="secondary">
          {c.tryAgain}
        </LinkButton>
      </div>
    );
  }
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <Notice tone="info" title={c.verifyingTitle}>
        {polls >= MAX_POLLS ? c.pendingTooLong : c.verifyingBody}
      </Notice>
      {polls >= MAX_POLLS && (
        <LinkButton href="/dashboard" variant="secondary">
          {c.goToDashboard}
        </LinkButton>
      )}
    </div>
  );
}
