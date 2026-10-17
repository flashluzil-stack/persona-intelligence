import { LOCALE_META, type Locale } from "./config";
import type { Messages } from "./messages";

/** Locale-aware formatting. Dates are formatted in UTC for stable server/client output. */
export function formatDate(value: string | null | undefined, locale: Locale, unknown = "—"): string {
  if (!value) return unknown;
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return unknown;
  return d.toLocaleDateString(LOCALE_META[locale].intl, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE_META[locale].intl, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(LOCALE_META[locale].intl);
}

export function formatMoney(amountMinor: number, currency: string, locale: Locale): string {
  const digits = ["JPY", "KRW"].includes(currency.toUpperCase()) ? 0 : 2;
  const amount = amountMinor / 10 ** digits;
  return new Intl.NumberFormat(LOCALE_META[locale].intl, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function relativeTime(value: string | null | undefined, t: Messages, locale: Locale, now = Date.now()): string {
  if (!value) return t.common.never;
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return t.common.justNow;
  if (minutes < 60) return t.common.minutesAgo(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.common.hoursAgo(hours);
  const days = Math.round(hours / 24);
  if (days < 30) return t.common.daysAgo(days);
  return formatDate(value, locale);
}

/** ISO date for `days` ago. Kept outside components so render stays pure. */
export function isoDaysAgo(days: number, dateOnly = false): string {
  const iso = new Date(Date.now() - days * 86_400_000).toISOString();
  return dateOnly ? iso.slice(0, 10) : iso;
}
