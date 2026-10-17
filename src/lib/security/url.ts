/**
 * URL normalization used for deduplication. Removes tracking parameters,
 * fragments, default ports and trailing slashes, and lower-cases the host.
 */

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "si",
  "_hsenc",
  "_hsmi",
]);

export function normalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);
  let path = url.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  url.pathname = path;
  // Treat http/https as the same resource for dedup purposes.
  return `${url.host}${url.pathname}${url.search}`;
}

export function domainOf(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when the string is an absolute http(s) URL that is safe to render as a link. */
export function isSafeExternalHref(input: string | null | undefined): input is string {
  if (!input) return false;
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
