"use client";

import { Activity } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import type { RetrievalCheck, SearchCheck } from "@/lib/research/diagnostics";
import { apiRequest } from "@/lib/utils/client-api";

interface DiagnosticsResult {
  checkedAt: string;
  search: SearchCheck[];
  retrieval: RetrievalCheck | null;
  ai: { configured: boolean; model: string | null };
}

/** Operator-only: runs real provider calls with neutral queries and shows exactly what happened. */
export function ProviderDiagnostics() {
  const { t } = useI18n();
  const d = t.diagnostics;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticsResult | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    const res = await apiRequest<DiagnosticsResult>("/api/diagnostics/providers", "POST", {});
    setPending(false);
    if (!res.ok || !res.data) return setError(res.error);
    setResult(res.data);
  };

  const status = (ok: boolean) => <Badge tone={ok ? "high" : "danger"}>{ok ? d.ok : d.failed}</Badge>;

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">{d.body}</p>
      <Button size="sm" variant="secondary" onClick={run} disabled={pending}>
        <Activity aria-hidden /> {pending ? d.running : d.run}
      </Button>
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}
      {result && (
        <ul className="divide-y divide-line rounded-md border border-line text-[13px]" aria-live="polite">
          {result.search.length === 0 && <li className="px-3 py-2.5 text-muted">{d.noSearch}</li>}
          {result.search.map((c) => (
            <li key={`${c.provider}:${c.category}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <span>
                <bdi className="font-medium">{c.label}</bdi> · {d.categories[c.category]}
                <span className="block text-muted">
                  {c.ok ? d.results(c.results) : d.errorCodes[c.error ?? "unknown"]} · {d.ms(c.ms)}
                  {c.retries ? ` · ${d.retries(c.retries)}` : ""}
                </span>
              </span>
              {status(c.ok)}
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span>
              <span className="font-medium">{d.retrieval}</span>
              <span className="block text-muted">
                {!result.retrieval ? d.retrievalOff : result.retrieval.ok ? d.chars(result.retrieval.chars) : d.errorCodes[result.retrieval.error ?? "unknown"]}
              </span>
            </span>
            {result.retrieval && status(result.retrieval.ok)}
          </li>
          <li className="px-3 py-2.5 text-muted">{d.ai(result.ai.model)}</li>
        </ul>
      )}
    </div>
  );
}
