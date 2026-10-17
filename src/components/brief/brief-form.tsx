"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/utils/client-api";
import { MEETING_OBJECTIVES, PURPOSE_LABELS, type ResearchPurpose } from "@/lib/validation/schemas";

export function BriefForm({ projectId, defaultObjective, enabled }: { projectId: string; defaultObjective?: ResearchPurpose; enabled: boolean }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string" && v.trim() !== ""));
    setPending(true);
    setError(null);
    setFields({});
    const res = await apiRequest<{ briefId: string }>(`/api/research/${projectId}/briefs`, "POST", body);
    setPending(false);
    if (!res.ok || !res.data) {
      setFields(res.fields);
      return setError(res.error);
    }
    router.push(`/research/${projectId}/briefs/${res.data.briefId}`);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="objective" label="Meeting objective" error={fields.objective}>
          <Select id="objective" name="objective" defaultValue={defaultObjective ?? "networking"}>
            {MEETING_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {PURPOSE_LABELS[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="durationMinutes" label="Meeting duration (minutes)" optional error={fields.durationMinutes}>
          <Input id="durationMinutes" name="durationMinutes" type="number" min={5} max={480} inputMode="numeric" />
        </Field>
        <Field id="desiredOutcome" label="Desired outcome" optional error={fields.desiredOutcome} className="sm:col-span-2">
          <Textarea id="desiredOutcome" name="desiredOutcome" rows={2} maxLength={1000} />
        </Field>
        <Field id="offering" label="What you are offering" optional error={fields.offering}>
          <Textarea id="offering" name="offering" rows={2} maxLength={1000} />
        </Field>
        <Field id="background" label="Your relevant background" optional error={fields.background}>
          <Textarea id="background" name="background" rows={2} maxLength={1500} />
        </Field>
        <Field id="constraints" label="Known constraints" optional error={fields.constraints}>
          <Textarea id="constraints" name="constraints" rows={2} maxLength={1000} />
        </Field>
        <Field id="questions" label="Questions you want answered" optional error={fields.questions}>
          <Textarea id="questions" name="questions" rows={2} maxLength={1500} />
        </Field>
      </div>
      <p className="text-[13px] text-muted">
        What you type here describes your own goals. It is sent to the AI provider to tailor the brief, is never treated as evidence about the person, and is saved with the brief.
      </p>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <Button type="submit" disabled={!enabled || pending}>
        <Sparkles aria-hidden />
        {pending ? "Generating brief… (up to a minute)" : "Generate meeting brief"}
      </Button>
    </form>
  );
}
