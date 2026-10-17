"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/utils/client-api";
import { useI18n } from "@/i18n/provider";
import { RESEARCH_PURPOSES } from "@/lib/validation/schemas";

/**
 * "Research a person" form. Research is always started explicitly and, if the
 * user prefers, after a cost confirmation.
 */
export function ResearchForm({ enabled, confirmBeforeRun }: { enabled: boolean; confirmBeforeRun: boolean }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const f = t.researchForm;
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string" && v.trim() !== ""));
    if (confirmBeforeRun && !confirm(f.confirmRun)) return;
    setPending(true);
    setError(null);
    setFields({});
    const res = await apiRequest<{ projectId: string }>("/api/research", "POST", { ...body, locale });
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
        <Field id="fullName" label={t.preview.fullName} error={fields.fullName} className="sm:col-span-2">
          <Input id="fullName" name="fullName" required maxLength={120} autoComplete="off" aria-invalid={Boolean(fields.fullName)} aria-describedby={fields.fullName ? "fullName-error" : undefined} placeholder={f.fullNamePlaceholder} />
        </Field>
        <Field id="company" label={t.preview.company} optional error={fields.company}>
          <Input id="company" name="company" maxLength={160} autoComplete="off" aria-invalid={Boolean(fields.company)} />
        </Field>
        <Field id="role" label={f.role} optional error={fields.role}>
          <Input id="role" name="role" maxLength={160} autoComplete="off" aria-invalid={Boolean(fields.role)} />
        </Field>
        <Field id="location" label={f.location} optional error={fields.location} hint={f.locationHint}>
          <Input id="location" name="location" maxLength={120} autoComplete="off" aria-invalid={Boolean(fields.location)} />
        </Field>
        <Field id="profileUrl" label={f.profileUrl} optional error={fields.profileUrl} hint={f.profileUrlHint}>
          <Input id="profileUrl" name="profileUrl" type="url" inputMode="url" maxLength={2048} placeholder="https://" dir="ltr" aria-invalid={Boolean(fields.profileUrl)} />
        </Field>
        <Field id="purpose" label={f.purpose} optional error={fields.purpose}>
          <Select id="purpose" name="purpose" defaultValue="">
            <option value="">{f.purposeGeneral}</option>
            {RESEARCH_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {t.purposes[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="context" label={f.context} optional error={fields.context} className="sm:col-span-2" hint={f.contextHint}>
          <Textarea id="context" name="context" maxLength={1500} rows={3} aria-invalid={Boolean(fields.context)} />
        </Field>
      </div>
      <Notice tone="info">
        {f.identifiersNotice}
      </Notice>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <Button type="submit" size="lg" disabled={!enabled || pending}>
        <Search aria-hidden />
        {pending ? f.submitting : f.submit}
      </Button>
    </form>
  );
}
