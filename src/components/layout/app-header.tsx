import { LayoutDashboard, LogOut, Settings, UserPlus } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";
import { getPublicConfig } from "@/lib/config";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./site-chrome";

const MODE_TONES = { demo: "demo", search_only: "moderate", analysis_only: "moderate", fully_configured: "accent" } as const;

export async function AppHeader({ email, guest }: { email: string | undefined; guest: boolean }) {
  const { t } = await getI18n();
  const mode = getPublicConfig().mode;
  const link = "inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-soft hover:bg-paper-sunken hover:text-ink";
  return (
    <header className="no-print border-b border-line bg-paper-raised/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <Badge tone={MODE_TONES[mode]} className="hidden lg:inline-flex" title={t.modes[mode]}>
            {t.modes[mode]}
          </Badge>
          {guest && <Badge tone="moderate">{t.nav.guestSession}</Badge>}
        </div>
        <nav aria-label={t.nav.app} className="flex items-center gap-0.5 sm:gap-1">
          <Link href="/dashboard" className={link}>
            <LayoutDashboard className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t.nav.dashboard}</span>
          </Link>
          {guest ? (
            <Link href="/sign-up" className={link}>
              <UserPlus className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t.nav.saveYourWork}</span>
            </Link>
          ) : (
            <Link href="/settings" className={link}>
              <Settings className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t.nav.settings}</span>
            </Link>
          )}
          <LanguageSwitcher className="ms-1" />
          <form action={signOutAction}>
            <button type="submit" className={link} title={email ? t.nav.signedInAs(email) : undefined}>
              <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
              <span className="hidden sm:inline">{t.nav.signOut}</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
