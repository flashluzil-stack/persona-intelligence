"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/primitives";
import type { IdentityState } from "@/lib/research/store";
import { isSafeExternalHref } from "@/lib/security/url";
import { apiRequest } from "@/lib/utils/client-api";

const STRENGTH: Record<string, { label: string; tone: "accent" | "moderate" | "low" | "insufficient" }> = {
  strong: { label: "Matches your identifiers", tone: "accent" },
  partial: { label: "Partially matches", tone: "moderate" },
  weak: { label: "Weak match", tone: "low" },
  none: { label: "Does not match your identifiers", tone: "insufficient" },
};

/** Shows candidate people with their public evidence and requires an explicit choice. */
export function IdentityChooser({ projectId, identity }: { projectId: string; identity: IdentityState }) {
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
      <legend className="sr-only">Choose the person you intended</legend>
      <Notice tone="warning" title="Which person did you mean?">
        {identity.reasoning ?? "Several people may match this name."} Profiles are never merged automatically. Choose the intended person based on the public
        evidence shown, or tell us none of them match.
      </Notice>
      <div className="grid gap-3 md:grid-cols-2">
        {(identity.candidates ?? []).map((c) => {
          const strength = STRENGTH[c.matchStrength] ?? STRENGTH.none;
          const checked = selected === c.id;
          return (
            <label
              key={c.id}
              className={`block cursor-pointer rounded-lg border bg-paper-raised p-4 transition-colors ${checked ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-line-strong"}`}
            >
              <div className="flex items-start gap-3">
                <input type="radio" name="candidate" value={c.id} checked={checked} onChange={() => setSelected(c.id)} className="mt-1 accent-[var(--accent)]" />
                <div className="min-w-0 space-y-2">
                  <p className="font-display text-[17px] font-semibold text-ink">{c.label}</p>
                  <p className="text-[14px] text-ink-soft">{c.description}</p>
                  <Badge tone={strength.tone}>{strength.label}</Badge>
                  {c.matchReasons.length > 0 && (
                    <ul className="list-disc space-y-0.5 ps-5 text-[13px] text-muted">
                      {c.matchReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                  <details>
                    <summary className="cursor-pointer text-[13px] font-medium text-accent">Supporting public sources ({c.sources.length})</summary>
                    <ul className="mt-1.5 space-y-1 text-[13px]">
                      {c.sources.slice(0, 8).map((s) => (
                        <li key={s.normalizedUrl} className="truncate">
                          {isSafeExternalHref(s.url) ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line-strong hover:decoration-accent">
                              {s.title ?? s.domain}
                            </a>
                          ) : (
                            s.title
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
          Anything that confirms the identity? <span className="font-normal text-faint">Optional</span>
        </label>
        <Textarea id="identity-context" value={context} onChange={(e) => setContext(e.target.value)} maxLength={500} rows={2} placeholder="e.g. We met at a fintech conference in Berlin" />
      </div>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => selected && submit(selected)} disabled={!selected || pending}>
          {pending ? "Saving…" : "Continue with this person"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (confirm("Stop this research? You can start a new search with more identifying details.")) submit("none");
          }}
        >
          None of these
        </Button>
      </div>
    </fieldset>
  );
}
