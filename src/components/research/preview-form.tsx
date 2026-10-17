"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";
import { apiRequest } from "@/lib/utils/client-api";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void };
  }
}

const TURNSTILE_JS = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Public free-preview form. A guest session is created on the server when needed. */
export function PreviewForm({ enabled, turnstileSiteKey, signedIn }: { enabled: boolean; turnstileSiteKey: string | null; signedIn: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const needsCaptcha = Boolean(turnstileSiteKey) && !signedIn;

  useEffect(() => {
    if (!needsCaptcha || !widgetRef.current) return;
    const render = () => {
      if (!window.turnstile || !widgetRef.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: turnstileSiteKey,
        language: locale,
        callback: (value: string) => setToken(value),
        "expired-callback": () => setToken(null),
      });
    };
    if (window.turnstile) return render();
    const script = document.createElement("script");
    script.src = TURNSTILE_JS;
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [needsCaptcha, turnstileSiteKey, locale]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string" && v.trim()) body[k] = v;
    if (needsCaptcha && !token) return setError(t.preview.captchaRequired);
    setPending(true);
    setError(null);
    setFields({});
    const res = await apiRequest<{ projectId: string }>("/api/preview", "POST", { ...body, captchaToken: token ?? undefined });
    if (!res.ok || !res.data) {
      setPending(false);
      setFields(res.fields);
      setError(res.error);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setToken(null);
      return;
    }
    router.push(`/research/${res.data.projectId}?tab=workspace`);
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field id="pv-fullName" label={t.preview.fullName} error={fields.fullName}>
        <Input id="pv-fullName" name="fullName" dir="auto" required maxLength={120} autoComplete="off" placeholder={t.researchForm.fullNamePlaceholder} aria-invalid={Boolean(fields.fullName)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pv-company" label={t.preview.company} optional error={fields.company}>
          <Input id="pv-company" name="company" dir="auto" maxLength={160} autoComplete="off" aria-invalid={Boolean(fields.company)} />
        </Field>
        <Field id="pv-role" label={t.preview.role} optional error={fields.role}>
          <Input id="pv-role" name="role" dir="auto" maxLength={160} autoComplete="off" aria-invalid={Boolean(fields.role)} />
        </Field>
      </div>
      {needsCaptcha && <div ref={widgetRef} className="min-h-[65px]" />}
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!enabled || pending}>
        <Search aria-hidden />
        {pending ? t.preview.submitting : t.preview.submit}
      </Button>
      <p className="text-[12.5px] text-muted">{t.preview.guestNote}</p>
    </form>
  );
}
