import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/config";
import { createServerSupabase } from "@/lib/supabase/server";

/** Exchanges the email-link code (sign-up confirmation, password recovery) for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  if (code && getSupabaseConfig()) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", request.url));
}
