"use client";

import { createContext, useContext, type ReactNode } from "react";
import { LOCALE_META, type Locale } from "./config";
import { getMessages, type Messages } from "./messages";

const I18nContext = createContext<Locale>("en");

/** Provides the active locale to client components. Dictionaries are imported client-side (they contain functions). */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext value={locale}>{children}</I18nContext>;
}

export function useI18n(): { locale: Locale; t: Messages; dir: "ltr" | "rtl" } {
  const locale = useContext(I18nContext);
  return { locale, t: getMessages(locale), dir: LOCALE_META[locale].dir };
}
