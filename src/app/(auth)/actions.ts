"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { getEnabledSocialProviders, isSocialProvider } from "@/lib/auth-providers";
import { getAppUrl, getSupabaseConfig } from "@/lib/config";
import { adoptGuestReports, rememberGuest } from "@/lib/guest";
import { authLimiter } from "@/lib/security/rate-limit";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
}

const emailSchema = z.email().max(254);
const passwordSchema = z.string().min(10).max(128);

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // Only allow same-site relative paths to prevent open redirects.
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

async function rateLimited(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return !authLimiter.check(`auth:${ip}`).allowed;
}

/** The current anonymous (guest) user, if any, so their preview can be moved to the account. */
async function currentGuestId(supabase: Awaited<ReturnType<typeof createServerSupabase>>): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.is_anonymous ? data.user.id : null;
}

/** Applies the language saved in the account, so it follows the user across devices. */
async function restoreLocale(supabase: Awaited<ReturnType<typeof createServerSupabase>>): Promise<void> {
  const { data } = await supabase.from("user_settings").select("locale").maybeSingle();
  const locale = data?.locale;
  if (isLocale(locale)) (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const { t } = await getI18n();
  const e = t.auth.errors;
  if (!getSupabaseConfig()) return { error: e.notConfigured };
  if (await rateLimited()) return { error: e.tooManyAttempts };
  const email = emailSchema.safeParse(form.get("email"));
  const password = z.string().min(1).max(128).safeParse(form.get("password"));
  if (!email.success || !password.success) {
    return {
      fields: {
        ...(email.success ? {} : { email: e.emailInvalid }),
        ...(password.success ? {} : { password: e.enterPassword }),
      },
    };
  }
  const supabase = await createServerSupabase();
  const guestId = await currentGuestId(supabase);
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  // Generic message: do not reveal whether the account exists.
  if (error || !data.user) return { error: e.invalidCredentials };
  await adoptGuestReports(data.user, guestId);
  await restoreLocale(supabase);
  redirect(safeNext(form.get("next")));
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const { t, locale } = await getI18n();
  const e = t.auth.errors;
  if (!getSupabaseConfig()) return { error: e.notConfigured };
  if (await rateLimited()) return { error: e.tooManyAttempts };
  const email = emailSchema.safeParse(form.get("email"));
  const password = passwordSchema.safeParse(form.get("password"));
  const accepted = form.get("acceptTerms") === "on";
  const fields: Record<string, string> = {};
  if (!email.success) fields.email = e.emailInvalid;
  if (!password.success) {
    const raw = form.get("password");
    fields.password = typeof raw === "string" && raw.length > 128 ? e.passwordLong : e.passwordShort;
  }
  if (!accepted) fields.acceptTerms = e.acceptTerms;
  if (Object.keys(fields).length || !email.success || !password.success) return { fields };

  const supabase = await createServerSupabase();
  const guestId = await currentGuestId(supabase);
  // Remember the guest so the preview can be adopted after email confirmation.
  if (guestId) await rememberGuest(guestId);
  const next = safeNext(form.get("next"));
  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: { emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(next)}`, data: { locale } },
  });
  if (error) return { error: /password/i.test(error.message) ? e.weakPassword : e.signUpFailed };
  if (data.session && data.user) {
    await adoptGuestReports(data.user, guestId);
    await supabase.from("user_settings").upsert({ user_id: data.user.id, locale }, { onConflict: "user_id" });
    redirect(next);
  }
  return { message: t.auth.checkEmail };
}

export async function oauthSignInAction(form: FormData): Promise<void> {
  const provider = form.get("provider");
  const next = safeNext(form.get("next"));
  if (!getSupabaseConfig() || !isSocialProvider(provider) || !(await getEnabledSocialProviders()).includes(provider)) {
    redirect(`/sign-in?error=provider&next=${encodeURIComponent(next)}`);
  }
  if (await rateLimited()) redirect(`/sign-in?error=rate&next=${encodeURIComponent(next)}`);
  const supabase = await createServerSupabase();
  const guestId = await currentGuestId(supabase);
  if (guestId) await rememberGuest(guestId);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/sign-in?error=oauth&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

export async function forgotPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const { t } = await getI18n();
  const e = t.auth.errors;
  if (!getSupabaseConfig()) return { error: e.notConfigured };
  if (await rateLimited()) return { error: e.tooManyAttempts };
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { fields: { email: e.emailInvalid } };
  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists.
  return { message: t.auth.resetSent };
}

export async function resetPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const { t } = await getI18n();
  const e = t.auth.errors;
  if (!getSupabaseConfig()) return { error: e.notConfigured };
  const password = passwordSchema.safeParse(form.get("password"));
  if (!password.success) return { fields: { password: e.passwordShort } };
  if (form.get("password") !== form.get("confirm")) return { fields: { confirm: e.passwordsMismatch } };
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user || data.user.is_anonymous) return { error: e.resetExpired };
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: e.resetFailed };
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  if (getSupabaseConfig()) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  redirect("/");
}
