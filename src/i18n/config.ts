/** Supported interface languages. Hebrew is right-to-left. */
export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "pi_locale";

export const LOCALE_META: Record<Locale, { label: string; dir: "ltr" | "rtl"; intl: string }> = {
  en: { label: "English", dir: "ltr", intl: "en-GB" },
  he: { label: "עברית", dir: "rtl", intl: "he-IL" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best supported locale from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "he" || base === "iw") return "he";
    if (base === "en") return "en";
  }
  return DEFAULT_LOCALE;
}
