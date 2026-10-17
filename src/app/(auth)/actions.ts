"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppUrl, getSupabaseConfig } from "@/lib/config";
import { authLimiter } from "@/lib/security/rate-limit";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
}

const emailSchema = z.email("Enter a valid email address").max(254);
const passwordSchema = z.string().min(10, "Use at least 10 characters").max(128, "Password is too long");

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

const NOT_CONFIGURED: AuthFormState = {
  error: "Authentication is not configured on this server. See README → Supabase configuration.",
};

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!getSupabaseConfig()) return NOT_CONFIGURED;
  if (await rateLimited()) return { error: "Too many attempts. Please wait a minute and try again." };
  const email = emailSchema.safeParse(form.get("email"));
  const password = z.string().min(1, "Enter your password").max(128).safeParse(form.get("password"));
  if (!email.success || !password.success) {
    return {
      fields: {
        ...(email.success ? {} : { email: email.error.issues[0].message }),
        ...(password.success ? {} : { password: password.error.issues[0].message }),
      },
    };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data });
  // Generic message: do not reveal whether the account exists.
  if (error) return { error: "Email or password is incorrect, or the email address has not been confirmed yet." };
  redirect(safeNext(form.get("next")));
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!getSupabaseConfig()) return NOT_CONFIGURED;
  if (await rateLimited()) return { error: "Too many attempts. Please wait a minute and try again." };
  const email = emailSchema.safeParse(form.get("email"));
  const password = passwordSchema.safeParse(form.get("password"));
  const accepted = form.get("acceptTerms") === "on";
  const fields: Record<string, string> = {};
  if (!email.success) fields.email = email.error.issues[0].message;
  if (!password.success) fields.password = password.error.issues[0].message;
  if (!accepted) fields.acceptTerms = "Please confirm you will use the service for legitimate professional purposes.";
  if (Object.keys(fields).length || !email.success || !password.success) return { fields };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: { emailRedirectTo: `${getAppUrl()}/auth/callback?next=/dashboard` },
  });
  if (error) {
    return { error: error.message.includes("Password") ? error.message : "Could not create the account. Try a different email or try again later." };
  }
  if (data.session) redirect("/dashboard");
  return { message: "Check your email to confirm your address, then sign in." };
}

export async function forgotPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!getSupabaseConfig()) return NOT_CONFIGURED;
  if (await rateLimited()) return { error: "Too many attempts. Please wait a minute and try again." };
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { fields: { email: email.error.issues[0].message } };
  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists.
  return { message: "If an account exists for that address, a password reset link is on its way." };
}

export async function resetPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!getSupabaseConfig()) return NOT_CONFIGURED;
  const password = passwordSchema.safeParse(form.get("password"));
  if (!password.success) return { fields: { password: password.error.issues[0].message } };
  if (form.get("password") !== form.get("confirm")) return { fields: { confirm: "Passwords do not match." } };
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "Could not update the password. Request a new reset link and try again." };
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  if (getSupabaseConfig()) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  redirect("/");
}
