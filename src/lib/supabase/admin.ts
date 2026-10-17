import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseConfig } from "@/lib/config";

/**
 * Service-role client. Bypasses Row Level Security, so it is used ONLY for:
 * - verified payment webhooks,
 * - entitlement changes after the route has checked ownership with the user's client,
 * - moving a guest's data to the account they sign in to.
 * Never use it to read data on behalf of a user.
 */
export function createServiceClient(): SupabaseClient {
  const cfg = getSupabaseConfig();
  const key = getServiceRoleKey();
  if (!cfg || !key) throw new Error("Service role is not configured (SUPABASE_SERVICE_ROLE_KEY).");
  return createClient(cfg.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
