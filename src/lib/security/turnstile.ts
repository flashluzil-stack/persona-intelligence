import "server-only";

/**
 * Cloudflare Turnstile verification for anonymous free previews (optional;
 * enabled when TURNSTILE_SECRET_KEY is set). Tokens are single-use.
 */
export async function verifyTurnstile(token: string | undefined, secret: string, ip?: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
