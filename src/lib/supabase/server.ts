import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/config";

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }
}

/** Cookie-bound client for Server Components, Server Functions and Route Handlers. */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component where cookies are read-only; the proxy refreshes sessions.
        }
      },
    },
  });
}

/**
 * Client acting as a specific user via their access token. Used for research
 * jobs that continue after the HTTP response, so Row Level Security still
 * applies to every query. No service-role key is involved.
 */
export function createUserScopedClient(accessToken: string): SupabaseClient {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new SupabaseNotConfiguredError();
  return createClient(cfg.url, cfg.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
