import { ProviderError } from "@/lib/research/types";

/**
 * Wraps a provider HTTP call with a timeout and bounded retries for
 * transient failures (network errors, 429, 5xx). Non-retryable errors are
 * thrown immediately.
 */
export async function withRetries<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: { retries: number; timeoutMs: number; provider: string; signal?: AbortSignal; baseDelayMs?: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    if (opts.signal?.aborted) throw new ProviderError(opts.provider, "timeout", "Research job was cancelled or timed out");
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
    try {
      return await fn(signal);
    } catch (err) {
      lastError = toProviderError(err, opts.provider);
      const retryable = lastError instanceof ProviderError && lastError.retryable;
      if (!retryable || attempt === opts.retries) break;
      const delay = (opts.baseDelayMs ?? 500) * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export function toProviderError(err: unknown, provider: string): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return new ProviderError(provider, "timeout", "Request timed out", true);
    }
    return new ProviderError(provider, "network", "Network error", true);
  }
  return new ProviderError(provider, "unknown", "Unknown error");
}

export function errorFromStatus(provider: string, status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError(provider, "unauthorized", `HTTP ${status}`);
  if (status === 402) return new ProviderError(provider, "quota_exceeded", "Quota exceeded");
  if (status === 429) return new ProviderError(provider, "rate_limited", "Rate limited", true);
  if (status >= 500) return new ProviderError(provider, "bad_response", `Upstream error (HTTP ${status})`, true);
  return new ProviderError(provider, "bad_response", `Unexpected response (HTTP ${status})`);
}
