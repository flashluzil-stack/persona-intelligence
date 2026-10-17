"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/i18n/actions";
import { LOCALE_META, LOCALES, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils/cn";

/** Compact EN / עב toggle. Persists the choice (cookie + account) and re-renders the whole app. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const choose = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  };
  return (
    <div role="group" aria-label={t.language.label} className={cn("inline-flex items-center gap-0.5 rounded-md border border-line bg-paper-raised p-0.5", pending && "opacity-60", className)}>
      <Languages className="mx-1 size-3.5 text-faint" aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => choose(l)}
          aria-pressed={l === locale}
          aria-label={t.language.switchTo(LOCALE_META[l].label)}
          className={cn(
            "rounded-sm px-2 py-1 text-[12.5px] leading-none transition-colors",
            l === locale ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-sunken",
          )}
        >
          {l === "he" ? "עב" : "EN"}
        </button>
      ))}
    </div>
  );
}
