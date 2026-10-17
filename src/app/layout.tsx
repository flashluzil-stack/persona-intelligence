import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/i18n/provider";
import { getI18n } from "@/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.common.appName, template: `%s · ${t.common.appName}` },
    description: t.landing.intro,
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#faf8f4",
};

/** Root layout: sets lang/dir from the resolved locale so the whole app flips for Hebrew (RTL). */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, dir, t } = await getI18n();
  return (
    <html lang={locale} dir={dir} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <I18nProvider locale={locale}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
            {t.nav.skip}
          </a>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
