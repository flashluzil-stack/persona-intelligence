import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALE_META, negotiateLocale, type Locale } from "./config";
import { getMessages, type Messages } from "./messages";

/**
 * Resolves the request locale: explicit cookie (set by the language selector
 * and on sign-in from the saved preference) → Accept-Language → default.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(cookie)) return cookie;
    return negotiateLocale((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
});

export async function getI18n(): Promise<{ locale: Locale; t: Messages; dir: "ltr" | "rtl" }> {
  const locale = await getLocale();
  return { locale, t: getMessages(locale), dir: LOCALE_META[locale].dir };
}
