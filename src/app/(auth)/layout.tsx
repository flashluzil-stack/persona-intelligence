import { PublicHeader } from "@/components/layout/site-chrome";
import { Notice } from "@/components/ui/primitives";
import { connection } from "next/server";
import { getSupabaseConfig } from "@/lib/config";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <>
      <PublicHeader />
      <main id="main" className="flex flex-1 items-start justify-center px-5 py-16">
        <div className="w-full max-w-sm space-y-6">
          {!getSupabaseConfig() && (
            <Notice tone="warning" title="Authentication is not configured">
              Set SUPABASE_URL and SUPABASE_ANON_KEY (see README). The fictional demo profile works without an account.
            </Notice>
          )}
          {children}
        </div>
      </main>
    </>
  );
}
