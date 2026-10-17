import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";
import { getAuth } from "@/lib/auth";
import { cn } from "@/lib/utils/cn";
import { LanguageSwitcher } from "./language-switcher";

export function Logo({ className, name = "Persona Intelligence" }: { className?: string; name?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5 text-ink no-underline", className)}>
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-sm bg-ink font-display text-[15px] font-semibold text-paper">
        P
      </span>
      <span dir="ltr" className="hidden font-display text-[17px] font-semibold tracking-tight min-[400px]:inline">
        {name}
      </span>
    </Link>
  );
}

export async function PublicHeader() {
  const [auth, { t }] = await Promise.all([getAuth().catch(() => null), getI18n()]);
  const signedIn = auth && !auth.user.is_anonymous;
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-5">
        <Logo />
        <nav aria-label={t.nav.main} className="flex items-center gap-1 sm:gap-2">
          <Link href="/demo" className="hidden rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken md:inline-block">
            {t.nav.sample}
          </Link>
          <Link href="/pricing" className="rounded-md px-2 py-2 text-sm text-ink-soft hover:bg-paper-sunken sm:px-3">
            {t.nav.pricing}
          </Link>
          <LanguageSwitcher />
          {auth ? (
            <LinkButton href="/dashboard" size="sm">
              {signedIn ? t.nav.openDashboard : t.nav.dashboard}
            </LinkButton>
          ) : (
            <>
              <Link href="/sign-in" className="hidden rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken sm:inline-block">
                {t.nav.signIn}
              </Link>
              <LinkButton href="/sign-up" size="sm">
                {t.nav.createAccount}
              </LinkButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const { t } = await getI18n();
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{t.footer.tagline}</p>
        <nav aria-label={t.nav.footer} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-ink">{t.footer.pricing}</Link>
          <Link href="/privacy" className="hover:text-ink">{t.footer.privacy}</Link>
          <Link href="/terms" className="hover:text-ink">{t.footer.terms}</Link>
          <Link href="/demo" className="hover:text-ink">{t.footer.sample}</Link>
        </nav>
      </div>
    </footer>
  );
}

export function PageContainer({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "narrow" | "wide" }) {
  return (
    <div className={cn("mx-auto px-4 sm:px-5", width === "narrow" ? "max-w-2xl" : width === "wide" ? "max-w-7xl" : "max-w-6xl", className)}>
      {children}
    </div>
  );
}
