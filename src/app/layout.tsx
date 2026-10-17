import type { Metadata, Viewport } from "next";
import "./globals.css";

// Locale/direction are centralized so Hebrew (dir="rtl") can be added without layout changes.
const LOCALE = { lang: "en", dir: "ltr" as const };

export const metadata: Metadata = {
  title: { default: "Persona Intelligence", template: "%s · Persona Intelligence" },
  description:
    "Evidence-based, public-source research to prepare for meetings, interviews and partnerships. Every claim links to its source.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#faf8f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={LOCALE.lang} dir={LOCALE.dir} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
