import { connection } from "next/server";
import { PublicHeader, SiteFooter } from "@/components/layout/site-chrome";
import { Notice } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";
import { getSupabaseConfig } from "@/lib/config";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const { t } = await getI18n();
  return (
    <>
      <PublicHeader />
      <main id="main" className="flex flex-1 items-start justify-center px-5 py-12 sm:py-16">
        <div className="w-full max-w-sm space-y-6">
          {!getSupabaseConfig() && (
            <Notice tone="warning" title={t.auth.notConfiguredTitle}>
              {t.auth.notConfiguredBody}
            </Notice>
          )}
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
