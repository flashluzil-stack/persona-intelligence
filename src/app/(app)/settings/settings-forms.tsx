"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { setLocaleAction } from "@/i18n/actions";
import { LOCALE_META, LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { apiRequest } from "@/lib/utils/client-api";
import { saveSettingsAction } from "./actions";

export function PreferencesForm({ displayName, retentionDays, confirmBeforeResearch }: { displayName: string; retentionDays: number; confirmBeforeResearch: boolean }) {
  const { t } = useI18n();
  const s = t.settings;
  const [state, action, pending] = useActionState(saveSettingsAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field id="displayName" label={s.displayName} optional>
        <Input id="displayName" name="displayName" dir="auto" defaultValue={displayName} maxLength={120} />
      </Field>
      <Field id="retentionDays" label={s.retention} hint={s.retentionHint}>
        <Select id="retentionDays" name="retentionDays" defaultValue={String(retentionDays)}>
          {[30, 90, 180, 365, 730].map((d) => (
            <option key={d} value={d}>
              {s.days(d)}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="confirmBeforeResearch" defaultChecked={confirmBeforeResearch} className="mt-1 accent-[var(--accent)]" />
        {s.confirmBeforeResearch}
      </label>
      {state.error && <Notice tone="danger" role="alert">{state.error}</Notice>}
      {state.message && <Notice tone="success" role="status">{state.message}</Notice>}
      <Button type="submit" disabled={pending}>
        {pending ? t.common.saving : s.savePrefs}
      </Button>
    </form>
  );
}

/** Language preference, saved to the account (and the cookie) so it follows the user. */
export function LanguagePreference() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Field id="locale" label={t.settings.language} hint={t.settings.languageHint}>
      <Select
        id="locale"
        value={locale}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setLocaleAction(e.target.value);
            router.refresh();
          })
        }
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_META[l].label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function SubscriptionControls({ cancelAtPeriodEnd }: { cancelAtPeriodEnd: boolean }) {
  const { t } = useI18n();
  const b = t.billingPanel;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "cancel" | "resume") => {
    if (action === "cancel" && !confirm(b.cancelConfirm)) return;
    setPending(true);
    setError(null);
    const res = await apiRequest("/api/billing/subscription", "POST", { action });
    setPending(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };
  return (
    <div className="space-y-2">
      {cancelAtPeriodEnd ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => act("resume")}>
          {pending ? t.common.saving : b.resume}
        </Button>
      ) : (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => act("cancel")}>
          {pending ? b.canceling : b.cancel}
        </Button>
      )}
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
    </div>
  );
}

export function DeleteAccountForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-3">
      <Field id="confirmDelete" label={t.settings.typeDelete}>
        <Input id="confirmDelete" dir="ltr" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
      </Field>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <Button
        variant="danger"
        disabled={confirmText !== "DELETE" || pending}
        onClick={async () => {
          setPending(true);
          const res = await apiRequest("/api/account/delete", "POST", { confirm: confirmText });
          setPending(false);
          if (!res.ok) return setError(res.error);
          router.push("/");
          router.refresh();
        }}
      >
        {pending ? t.common.deleting : t.settings.deleteMine}
      </Button>
    </div>
  );
}
