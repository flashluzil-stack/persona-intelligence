"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import type { IdentityState } from "@/lib/research/store";
import { isSafeExternalHref } from "@/lib/security/url";
import { apiRequest } from "@/lib/utils/client-api";

const TONES = { strong: "accent", partial: "moderate", weak: "low", none: "insufficient" } as const;

/** Shows candidate people with their public evidence and requires an explicit choice. */
export function IdentityChooser({ projectId, identity }: { projectId: string; identity: IdentityState }) {
  const { t } = useI18n();
  const x = t.identity;
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (candidateId: string) => {
    setPending(true);
    setError(null);
    const res = await apiRequest(`/api/research/${projectId}/identity`, "POST", { candidateId, additionalContext: context || undefined });
    setPending(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">{x.legend}</legend>
      <Notice tone="warning" title={x.whichPerson}>
        <span dir="auto">{identity.reasoning ?? x.defaultReason}</span> {x.explain}
      </Notice>
      <div className="grid gap-3 md:grid-cols-2">
        {(identity.candidates ?? []).map((c) => {
          const checked = selected === c.id;
          return (
            <label
              key={c.id}
              className={`block cursor-pointer rounded-lg border bg-paper-raised p-4 transition-colors ${checked ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-line-strong"}`}
            >
              <div className="flex items-start gap-3">
                <input type="radio" name="candidate" value={c.id} checked={checked} onChange={() => setSelected(c.id)} className="mt-1 accent-[var(--accent)]" />
                <div className="min-w-0 space-y-2">
                  <p dir="auto" className="font-display text-[17px] font-semibold text-ink">{c.label}</p>
                  <p dir="auto" className="text-[14px] text-ink-soft">{c.description}</p>
                  <Badge tone={TONES[c.matchStrength] ?? "insufficient"}>{x[c.matchStrength] ?? x.none}</Badge>
                  {c.matchReasons.length > 0 && (
                    <ul className="list-disc space-y-0.5 ps-5 text-[13px] text-muted">
                      {c.matchReasons.map((r, i) => (
                        <li key={i} dir="auto">{r}</li>
                      ))}
                    </ul>
                  )}
                  <details>
                    <summary className="cursor-pointer text-[13px] font-medium text-accent">{x.supportingSources(c.sources.length)}</summary>
                    <ul className="mt-1.5 space-y-1 text-[13px]">
                      {c.sources.slice(0, 8).map((s) => (
                        <li key={s.normalizedUrl} className="truncate">
                          {isSafeExternalHref(s.url) ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line-strong hover:decoration-accent">
                              <bdi>{s.title ?? s.domain}</bdi>
                            </a>
                          ) : (
                            <bdi>{s.title}</bdi>
                          )}{" "}
                          <span className="text-faint">· {s.domain}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="identity-context" className="text-sm font-medium text-ink">
          {x.contextLabel} <span className="font-normal text-faint">{t.common.optional}</span>
        </label>
        <Textarea id="identity-context" dir="auto" value={context} onChange={(e) => setContext(e.target.value)} maxLength={500} rows={2} placeholder={x.contextPlaceholder} />
      </div>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => selected && submit(selected)} disabled={!selected || pending}>
          {pending ? t.common.saving : x.continue}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => confirm(x.confirmStop) && submit("none")}>
          {x.noneOfThese}
        </Button>
      </div>
    </fieldset>
  );
}
