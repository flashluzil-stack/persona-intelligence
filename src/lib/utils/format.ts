/** Locale-aware formatting helpers. Centralized so a future Hebrew locale can swap them. */
export const LOCALE = "en-GB";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Date unknown";
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "never";
  const diff = now - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

/** ISO date (YYYY-MM-DD or full timestamp) for `days` ago. Kept outside components so render stays pure. */
export function isoDaysAgo(days: number, dateOnly = false): string {
  const iso = new Date(Date.now() - days * 86_400_000).toISOString();
  return dateOnly ? iso.slice(0, 10) : iso;
}
