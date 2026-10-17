"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  oauthSignInAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { useI18n } from "@/i18n/provider";

function Status({ state }: { state: AuthFormState }) {
  if (state.error) return <Notice tone="danger" role="alert">{state.error}</Notice>;
  if (state.message) return <Notice tone="success" role="status">{state.message}</Notice>;
  return null;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.5 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4zM13.9 5c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}

/** Google / Apple buttons. Rendered only for providers enabled in Supabase Auth. */
export function SocialButtons({ providers, next }: { providers: Array<"google" | "apple">; next?: string }) {
  const { t } = useI18n();
  if (providers.length === 0) return null;
  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <form key={p} action={oauthSignInAction}>
          <input type="hidden" name="provider" value={p} />
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <Button type="submit" variant="secondary" className="w-full">
            {p === "google" ? <GoogleMark /> : <AppleMark />}
            {p === "google" ? t.auth.continueWithGoogle : t.auth.continueWithApple}
          </Button>
        </form>
      ))}
      <div className="flex items-center gap-3 text-xs text-faint" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        {t.auth.or}
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const { t } = useI18n();
  const a = t.auth;
  const [state, action, pending] = useActionState(signInAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      {notice && <Notice tone="warning">{notice}</Notice>}
      <Field id="email" label={a.email} error={state.fields?.email}>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required aria-invalid={Boolean(state.fields?.email)} />
      </Field>
      <Field id="password" label={a.password} error={state.fields?.password}>
        <Input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required aria-invalid={Boolean(state.fields?.password)} />
      </Field>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? a.signingIn : a.signIn}
      </Button>
      <p className="text-center text-sm text-muted">
        <Link href="/forgot-password" className="underline hover:text-ink">
          {a.forgotLink}
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const a = t.auth;
  const [state, action, pending] = useActionState(signUpAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field id="email" label={a.email} error={state.fields?.email}>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required aria-invalid={Boolean(state.fields?.email)} />
      </Field>
      <Field id="password" label={a.password} error={state.fields?.password} hint={a.passwordHint}>
        <Input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={10} aria-invalid={Boolean(state.fields?.password)} />
      </Field>
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="acceptTerms" className="mt-1 accent-[var(--accent)]" />
          <span>
            {a.acceptTermsBefore}
            <Link href="/terms" className="underline">
              {a.acceptTermsLink}
            </Link>
            {a.acceptTermsMiddle}
            <Link href="/privacy" className="underline">
              {a.acceptPrivacyLink}
            </Link>
            {a.acceptTermsAfter}
          </span>
        </label>
        {state.fields?.acceptTerms && <p className="text-[13px] text-danger" role="alert">{state.fields.acceptTerms}</p>}
      </div>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? a.creatingAccount : a.createAccount}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="email" label={t.auth.email} error={state.fields?.email}>
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required />
      </Field>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.auth.sending : t.auth.sendResetLink}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const { t } = useI18n();
  const a = t.auth;
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="password" label={a.newPassword} error={state.fields?.password} hint={a.passwordHint}>
        <Input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" required />
      </Field>
      <Field id="confirm" label={a.confirmPassword} error={state.fields?.confirm}>
        <Input id="confirm" name="confirm" type="password" dir="ltr" autoComplete="new-password" required />
      </Field>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.saving : a.updatePassword}
      </Button>
    </form>
  );
}
