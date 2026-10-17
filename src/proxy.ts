import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/config";

const PROTECTED_PREFIXES = ["/dashboard", "/research", "/settings", "/billing"];

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated visitors away from protected pages. This is a convenience
 * layer only: every page and API route re-checks auth on the server, and
 * Row Level Security enforces isolation in the database.
 */
export async function proxy(request: NextRequest) {
  const cfg = getSupabaseConfig();
  if (!cfg) return NextResponse.next();
  const { url, anonKey: key } = cfg;

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!data.user && PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(redirectUrl);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/webhooks|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
