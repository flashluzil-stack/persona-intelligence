import type { Locale } from "../config";
import { privacyEn, termsEn, type LegalDoc } from "./en";
import { privacyHe, termsHe } from "./he";

export type { LegalDoc };

export function getLegal(locale: Locale): { privacy: LegalDoc; terms: LegalDoc } {
  return locale === "he" ? { privacy: privacyHe, terms: termsHe } : { privacy: privacyEn, terms: termsEn };
}
