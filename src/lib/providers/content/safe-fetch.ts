import "server-only";
import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { USER_AGENT } from "@/lib/config";
import { ProviderError } from "@/lib/research/types";
import { assertPublicUrl, isPublicAddress, SsrfError } from "@/lib/security/ip";

/**
 * DNS lookup that refuses to return private/reserved addresses. Installed on
 * the HTTP agent, so the check happens at connect time for every hop — this
 * defeats DNS rebinding and redirects into internal networks.
 */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new SsrfError("Destination resolves to a private or reserved address"), "", 0);
    }
    if (options.all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

let sharedAgent: Agent | null = null;
function agent(): Agent {
  sharedAgent ??= new Agent({
    connect: { lookup: publicOnlyLookup, timeout: 10_000 },
    headersTimeout: 15_000,
    bodyTimeout: 15_000,
  });
  return sharedAgent;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

export interface SafeFetchOptions {
  maxBytes: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  accept?: string;
  allowedContentTypes?: RegExp;
}

/** GET a public URL with SSRF protection, manual redirect validation and a size cap. */
export async function safeFetch(input: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 3;
  let current = assertPublicUrl(input);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res;
    try {
      res = await undiciFetch(current, {
        dispatcher: agent(),
        redirect: "manual",
        signal: opts.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: opts.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.8",
          "Accept-Language": "en;q=0.9,*;q=0.5",
        },
      });
    } catch (err) {
      const cause = (err as { cause?: unknown }).cause;
      if (err instanceof SsrfError || cause instanceof SsrfError) {
        throw new ProviderError("Page retrieval", "blocked", "Destination address is not public");
      }
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new ProviderError("Page retrieval", "timeout", "Page did not respond in time", true);
      }
      throw new ProviderError("Page retrieval", "network", "Page could not be reached", true);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new ProviderError("Page retrieval", "bad_response", "Redirect without location");
      try {
        current = assertPublicUrl(new URL(location, current).toString());
      } catch {
        throw new ProviderError("Page retrieval", "blocked", "Redirect to a non-public destination was blocked");
      }
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && opts.allowedContentTypes && !opts.allowedContentTypes.test(contentType)) {
      await res.body?.cancel();
      throw new ProviderError("Page retrieval", "unsupported_content", "Unsupported content type");
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > opts.maxBytes * 4) {
      await res.body?.cancel();
      throw new ProviderError("Page retrieval", "too_large", "Page is too large");
    }

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > opts.maxBytes) {
          chunks.push(value.subarray(0, value.byteLength - (total - opts.maxBytes)));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { finalUrl: current.toString(), status: res.status, contentType, body, truncated };
  }
  throw new ProviderError("Page retrieval", "bad_response", "Too many redirects");
}
