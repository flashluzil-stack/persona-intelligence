import type { Locale } from "../config";
import en, { type Messages } from "./en";
import he from "./he";

export type { Messages };

const DICTIONARIES: Record<Locale, Messages> = { en, he };

/** Returns the message dictionary for a locale. Safe on server and client. */
export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? en;
}
