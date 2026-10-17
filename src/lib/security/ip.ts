
/**
 * Server-side request forgery protection — pure checks with no Node.js
 * dependencies, so validation schemas can also run in the browser.
 *
 * Every outbound fetch of a user- or search-supplied URL must pass
 * `assertPublicUrl` (protocol, credentials, port, hostname) and must connect
 * only to addresses accepted by `isPublicAddress`. The safe fetcher enforces
 * the address check at connect time (see content/safe-fetch.ts), which also
 * defeats DNS rebinding and redirects to internal hosts.
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".cluster.local"];

const ALLOWED_PORTS = new Set(["", "80", "443"]);

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIPv4(ip: string): boolean {
  return IPV4_RE.test(ip);
}

export function isIPv6(ip: string): boolean {
  return ip.includes(":") && expandIPv6(ip) !== null;
}

function isIP(ip: string): boolean {
  return isIPv4(ip) || isIPv6(ip);
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function isPublicIPv4(ip: string): boolean {
  return !BLOCKED_V4.some(([base, bits]) => inCidr4(ip, base, bits));
}

function expandIPv6(ip: string): number[] | null {
  let address = ip.toLowerCase();
  const zone = address.indexOf("%");
  if (zone >= 0) address = address.slice(0, zone);
  // Embedded IPv4 tail, e.g. ::ffff:127.0.0.1
  const v4Match = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    const v4 = v4Match[1];
    if (!isIPv4(v4)) return null;
    const n = ipv4ToInt(v4);
    address = address.replace(v4, `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`);
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const parsed = groups.map((g) => Number.parseInt(g || "0", 16));
  return parsed.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff) ? null : parsed;
}

function isPublicIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  const allZeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  // :: and ::1
  if (allZeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return false;
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (allZeroPrefix(5) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isPublicIPv4(v4);
  }
  // NAT64 64:ff9b::/96 embeds an IPv4 address.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isPublicIPv4(v4);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return false; // deprecated site-local
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // discard 100::/64
  if (g[0] === 0x2002) return false; // 6to4 can tunnel to private v4
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  return true;
}

export function isPublicAddress(ip: string): boolean {
  if (isIPv4(ip)) return isPublicIPv4(ip);
  if (isIPv6(ip)) return isPublicIPv6(ip);
  return false;
}

/** Synchronous structural checks that do not need DNS. Returns the parsed URL. */
export function assertPublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only http and https URLs can be retrieved");
  }
  if (url.username || url.password) {
    throw new SsrfError("URLs containing credentials are not allowed");
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SsrfError("Only default web ports (80/443) are allowed");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) throw new SsrfError("Missing hostname");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SsrfError("Internal hostnames are not allowed");
  }
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new SsrfError("Private or reserved IP addresses are not allowed");
  } else {
    // Reject numeric/hex/octal host forms that some resolvers treat as IPs (e.g. 2130706433, 0x7f.1).
    if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f.x]+$/i.test(host) || !host.includes(".")) {
      throw new SsrfError("Hostname is not a public domain name");
    }
  }
  return url;
}

