"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";

function Status({ state }: { state: AuthFormState }) {
  if (state.error) return <Notice tone="danger" role="alert">{state.error}</Notice>;
  if (state.message) return <Notice tone="success" role="status">{state.message}</Notice>;
  return null;
}

export function SignInForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(signInAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      {linkError && <Notice tone="warning">That link is invalid or has expired. Sign in or request a new link.</Notice>}
      <Field id="email" label="Email" error={state.fields?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state.fields?.email)} />
      </Field>
      <Field id="password" label="Password" error={state.fields?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(state.fields?.password)} />
      </Field>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        <Link href="/forgot-password" className="underline hover:text-ink">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="email" label="Email" error={state.fields?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state.fields?.email)} />
      </Field>
      <Field id="password" label="Password" error={state.fields?.password} hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} aria-invalid={Boolean(state.fields?.password)} />
      </Field>
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="acceptTerms" className="mt-1 accent-[var(--accent)]" />
          <span>
            I will use Persona Intelligence for legitimate professional preparation, not to harass, surveil or make eligibility decisions about people. I have read the{" "}
            <Link href="/privacy" className="underline">
              privacy &amp; limitations
            </Link>{" "}
            page.
          </span>
        </label>
        {state.fields?.acceptTerms && <p className="text-[13px] text-danger" role="alert">{state.fields.acceptTerms}</p>}
      </div>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="email" label="Email" error={state.fields?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field id="password" label="New password" error={state.fields?.password} hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field id="confirm" label="Confirm new password" error={state.fields?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Status state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
