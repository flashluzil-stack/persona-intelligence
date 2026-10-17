import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton } from "@/components/ui/button";
import { getAuth } from "@/lib/auth";
import { cn } from "@/lib/utils/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5 text-ink no-underline", className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-sm bg-ink font-display text-[15px] font-semibold text-paper">
        P
      </span>
      <span className="font-display text-[17px] font-semibold tracking-tight">Persona Intelligence</span>
    </Link>
  );
}

export async function PublicHeader() {
  const auth = await getAuth().catch(() => null);
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link href="/demo" className="hidden rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken sm:inline-block">
            Sample profile
          </Link>
          <Link href="/privacy" className="hidden rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken sm:inline-block">
            Privacy &amp; limits
          </Link>
          {auth ? (
            <LinkButton href="/dashboard" size="sm">
              Open dashboard
            </LinkButton>
          ) : (
            <>
              <Link href="/sign-in" className="rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken">
                Sign in
              </Link>
              <LinkButton href="/sign-up" size="sm">
                Create account
              </LinkButton>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Persona Intelligence — public-source research for professional meetings.</p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/privacy" className="hover:text-ink">
            Privacy &amp; limitations
          </Link>
          <Link href="/demo" className="hover:text-ink">
            Fictional sample
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PageContainer({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "narrow" | "wide" }) {
  return (
    <div className={cn("mx-auto px-5", width === "narrow" ? "max-w-2xl" : width === "wide" ? "max-w-7xl" : "max-w-6xl", className)}>
      {children}
    </div>
  );
}
