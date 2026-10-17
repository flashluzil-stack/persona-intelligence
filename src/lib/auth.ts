import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getSupabaseConfig } from "@/lib/config";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AuthContext {
  supabase: SupabaseClient;
  user: User;
}

/**
 * Data Access Layer entry point. Verifies the session with Supabase Auth
 * (getUser validates the JWT server-side; never trust getSession alone).
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  // Always render per request: configuration is read at runtime and sessions are per user.
  await connection();
  if (!getSupabaseConfig()) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
});

export async function requireAuth(next?: string): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return auth;
}

/** For route handlers: returns the auth context or null (caller responds 401). */
export async function getApiAuth(): Promise<(AuthContext & { accessToken: string }) | null> {
  const auth = await getAuth();
  if (!auth) return null;
  const { data } = await auth.supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return null;
  return { ...auth, accessToken };
}
