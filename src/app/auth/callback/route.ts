import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getSupabaseConfig } from "@/lib/config";
import { adoptGuestReports } from "@/lib/guest";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Exchanges an auth code (email confirmation, password recovery, Google/Apple
 * OAuth) for a session, then moves any remembered guest preview to the account.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\") ? nextParam : "/dashboard";
  const providerError = request.nextUrl.searchParams.get("error");
  if (code && getSupabaseConfig()) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await adoptGuestReports(data.user);
      const response = NextResponse.redirect(new URL(next, request.url));
      const { data: settings } = await supabase.from("user_settings").select("locale").maybeSingle();
      if (isLocale(settings?.locale)) response.cookies.set(LOCALE_COOKIE, settings.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
      return response;
    }
  }
  return NextResponse.redirect(new URL(`/sign-in?error=${providerError ? "oauth" : "link"}`, request.url));
}
