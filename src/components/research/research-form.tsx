"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/utils/client-api";
import { PURPOSE_LABELS, RESEARCH_PURPOSES } from "@/lib/validation/schemas";

/**
 * "Research a person" form. Research is always started explicitly and, if the
 * user prefers, after a cost confirmation.
 */
export function ResearchForm({ enabled, confirmBeforeRun }: { enabled: boolean; confirmBeforeRun: boolean }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string" && v.trim() !== ""));
    if (confirmBeforeRun && !confirm("Start research? This runs several web searches and AI analysis calls and counts toward your daily quota.")) return;
    setPending(true);
    setError(null);
    setFields({});
    const res = await apiRequest<{ projectId: string }>("/api/research", "POST", body);
    setPending(false);
    if (!res.ok || !res.data) {
      setFields(res.fields);
      setError(res.error);
      return;
    }
    router.push(`/research/${res.data.projectId}?tab=workspace`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" error={fields.fullName} className="sm:col-span-2">
          <Input id="fullName" name="fullName" required maxLength={120} autoComplete="off" aria-invalid={Boolean(fields.fullName)} aria-describedby={fields.fullName ? "fullName-error" : undefined} placeholder="e.g. Maya Brenner" />
        </Field>
        <Field id="company" label="Company or organization" optional error={fields.company}>
          <Input id="company" name="company" maxLength={160} autoComplete="off" aria-invalid={Boolean(fields.company)} />
        </Field>
        <Field id="role" label="Job title or profession" optional error={fields.role}>
          <Input id="role" name="role" maxLength={160} autoComplete="off" aria-invalid={Boolean(fields.role)} />
        </Field>
        <Field id="location" label="Country or city" optional error={fields.location} hint="City or country level only.">
          <Input id="location" name="location" maxLength={120} autoComplete="off" aria-invalid={Boolean(fields.location)} />
        </Field>
        <Field id="profileUrl" label="Known public profile URL" optional error={fields.profileUrl} hint="Personal site, company bio or public profile.">
          <Input id="profileUrl" name="profileUrl" type="url" inputMode="url" maxLength={2048} placeholder="https://" aria-invalid={Boolean(fields.profileUrl)} />
        </Field>
        <Field id="purpose" label="Research purpose" optional error={fields.purpose}>
          <Select id="purpose" name="purpose" defaultValue="">
            <option value="">General preparation</option>
            {RESEARCH_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {PURPOSE_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="context" label="Additional context" optional error={fields.context} className="sm:col-span-2" hint="Anything that helps tell this person apart from others with the same name. It is used to guide matching, never treated as evidence.">
          <Textarea id="context" name="context" maxLength={1500} rows={3} aria-invalid={Boolean(fields.context)} />
        </Field>
      </div>
      <Notice tone="info">
        Each identifier you add (company, role, profile URL) reduces the risk of confusing people who share a name. If more than one person matches, you will be asked
        to choose. Profiles are never merged automatically.
      </Notice>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <Button type="submit" size="lg" disabled={!enabled || pending}>
        <Search aria-hidden />
        {pending ? "Starting research…" : "Research this person"}
      </Button>
    </form>
  );
}
