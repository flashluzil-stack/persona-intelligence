"use server";

import { cookies } from "next/headers";
import { getAuth } from "@/lib/auth";
import { isLocale, LOCALE_COOKIE } from "./config";

/** Persists the language choice: cookie for every visitor, user_settings for signed-in users. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  const auth = await getAuth().catch(() => null);
  if (auth) {
    await auth.supabase.from("user_settings").upsert({ user_id: auth.user.id, locale }, { onConflict: "user_id" });
  }
}
