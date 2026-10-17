import { lookup as dnsLookup } from "node:dns/promises";
import { assertPublicUrl, isIPv4, isIPv6, isPublicAddress, SsrfError } from "./ip";

/**
 * DNS-aware SSRF validation (server only). Structural checks live in ./ip so
 * they can be shared with client-side form validation.
 */

export { assertPublicUrl, isPublicAddress, SsrfError };

export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultResolver: Resolver = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/** Full validation: structure + every resolved address must be public. */
export async function validatePublicUrl(input: string, resolve: Resolver = defaultResolver): Promise<URL> {
  const url = assertPublicUrl(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIPv4(host) || isIPv6(host)) return url;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolve(host);
  } catch {
    throw new SsrfError("Hostname could not be resolved");
  }
  if (addresses.length === 0) throw new SsrfError("Hostname could not be resolved");
  for (const { address } of addresses) {
    if (!isPublicAddress(address)) {
      throw new SsrfError("Hostname resolves to a private or reserved address");
    }
  }
  return url;
}
