"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { apiRequest } from "@/lib/utils/client-api";
import { saveSettingsAction } from "./actions";

export function PreferencesForm({ displayName, retentionDays, confirmBeforeResearch }: { displayName: string; retentionDays: number; confirmBeforeResearch: boolean }) {
  const [state, action, pending] = useActionState(saveSettingsAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field id="displayName" label="Display name" optional>
        <Input id="displayName" name="displayName" defaultValue={displayName} maxLength={120} />
      </Field>
      <Field id="retentionDays" label="Keep inactive research projects for" hint="Projects not updated within this window are deleted automatically, including sources, briefs and notes.">
        <Select id="retentionDays" name="retentionDays" defaultValue={String(retentionDays)}>
          {[30, 90, 180, 365, 730].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="confirmBeforeResearch" defaultChecked={confirmBeforeResearch} className="mt-1 accent-[var(--accent)]" />
        Ask for confirmation before starting a research run (each run uses search and AI quota)
      </label>
      {state.error && <Notice tone="danger" role="alert">{state.error}</Notice>}
      {state.message && <Notice tone="success" role="status">{state.message}</Notice>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-3">
      <Field id="confirmDelete" label='Type "DELETE" to permanently delete your account and all data'>
        <Input id="confirmDelete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </Field>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <Button
        variant="danger"
        disabled={confirm !== "DELETE" || pending}
        onClick={async () => {
          setPending(true);
          const res = await apiRequest("/api/account/delete", "POST", { confirm });
          setPending(false);
          if (!res.ok) return setError(res.error);
          router.push("/");
          router.refresh();
        }}
      >
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </div>
  );
}
