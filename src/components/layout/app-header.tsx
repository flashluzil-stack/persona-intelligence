import { LayoutDashboard, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/primitives";
import { getPublicConfig } from "@/lib/config";
import { Logo } from "./site-chrome";

const MODE_LABELS = {
  demo: { label: "Demo mode — no research providers configured", tone: "demo" as const },
  search_only: { label: "Live search · AI analysis not configured", tone: "moderate" as const },
  analysis_only: { label: "AI configured · no live search", tone: "moderate" as const },
  fully_configured: { label: "Live research configured", tone: "accent" as const },
};

export function AppHeader({ email }: { email: string | undefined }) {
  const mode = MODE_LABELS[getPublicConfig().mode];
  return (
    <header className="no-print border-b border-line bg-paper-raised/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          <Badge tone={mode.tone} className="hidden md:inline-flex" title={mode.label}>
            {mode.label}
          </Badge>
        </div>
        <nav aria-label="Application" className="flex items-center gap-1">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken hover:text-ink">
            <LayoutDashboard className="size-4" aria-hidden />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <Link href="/settings" className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken hover:text-ink">
            <Settings className="size-4" aria-hidden />
            <span className="hidden sm:inline">Settings</span>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-paper-sunken hover:text-ink"
              title={email ? `Signed in as ${email}` : undefined}
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
