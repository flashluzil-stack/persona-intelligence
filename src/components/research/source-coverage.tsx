"use client";

import { Badge } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import type { ProviderErrorCode, ProviderRunReport, SourceCategoryStatus } from "@/lib/research/types";

const TONE: Record<SourceCategoryStatus["state"], "high" | "moderate" | "danger" | "neutral"> = {
  searched: "high",
  partial: "moderate",
  failed: "danger",
  not_configured: "neutral",
  not_available: "neutral",
  skipped: "neutral",
};

const USER_FACING_ERRORS: ProviderErrorCode[] = ["not_configured", "unauthorized", "rate_limited", "quota_exceeded", "timeout", "network"];

/** What was actually searched, per source category and provider. Never shows a category as searched unless it was. */
export function SourceCoverage({ categories, providers }: { categories: SourceCategoryStatus[]; providers: ProviderRunReport[] }) {
  const { t } = useI18n();
  const c = t.coverage;

  const detail = (s: SourceCategoryStatus): string | null => {
    if (s.category === "page_retrieval") return s.state === "not_configured" ? c.notes.retrievalOff : s.count !== undefined ? c.pages(s.count) : null;
    if (s.category === "profile") {
      if (s.state === "skipped") return c.notes.noProfile;
      if (s.state === "not_available") return c.notes.profileRestricted;
      if (s.state === "failed") return c.notes.profileFailed;
      return null;
    }
    if (s.category === "news" && s.state === "not_configured") return c.notes.newsNotConfigured;
    if (s.category === "forums") return c.notes.forums;
    if (s.state === "not_available") return [c.notes.noIntegration, s.count ? c.foundViaWeb(s.count) : null].filter(Boolean).join(" ");
    const parts = [s.count !== undefined ? c.results(s.count) : null, s.providers?.length ? c.via(s.providers.join(", ")) : null].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-md border border-line">
        {categories.map((s) => (
          <li key={s.category} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{c.categories[s.category]}</p>
              {detail(s) && (
                <p className="text-[12.5px] text-muted">
                  <bdi>{detail(s)}</bdi>
                </p>
              )}
            </div>
            <Badge tone={TONE[s.state]} className="shrink-0">
              {c.states[s.state]}
            </Badge>
          </li>
        ))}
      </ul>
      {providers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12.5px] font-medium text-ink-soft">{c.providersTitle}</p>
          <ul className="space-y-1 text-[12.5px] text-muted">
            {providers.map((p) => {
              const errors = USER_FACING_ERRORS.filter((code) => p.errors[code]).map((code) => t.engine.provider[code as keyof typeof t.engine.provider](p.label));
              const extra = [p.retries ? c.retries(p.retries) : null, p.disabled ? c.disabled : null].filter(Boolean).join(" · ");
              return (
                <li key={`${p.provider}:${p.category}`}>
                  <bdi>
                    {c.providerLine(`${p.label} (${c.categories[p.category]})`, p.succeeded, p.queries, p.results)}
                    {extra ? ` · ${extra}` : ""}
                  </bdi>
                  {errors.map((e) => (
                    <span key={e} className="block text-danger">
                      {e}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
