import "server-only";
import { getSupabaseConfig } from "@/lib/config";

export type SocialProvider = "google" | "apple";
export const SOCIAL_PROVIDERS: SocialProvider[] = ["google", "apple"];

let cached: { at: number; value: SocialProvider[] } | null = null;
const TTL_MS = 5 * 60_000;

/**
 * Social sign-in buttons are shown only for providers that are actually
 * enabled in Supabase Auth. The public settings endpoint is the source of
 * truth; on any error no social buttons are shown.
 */
export async function getEnabledSocialProviders(): Promise<SocialProvider[]> {
  const cfg = getSupabaseConfig();
  if (!cfg) return [];
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value: SocialProvider[] = [];
  try {
    const res = await fetch(`${cfg.url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: cfg.anonKey },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { external?: Record<string, unknown> };
      value = SOCIAL_PROVIDERS.filter((p) => body.external?.[p] === true);
    }
  } catch {
    value = [];
  }
  cached = { at: Date.now(), value };
  return value;
}

export function isSocialProvider(value: unknown): value is SocialProvider {
  return typeof value === "string" && (SOCIAL_PROVIDERS as string[]).includes(value);
}
