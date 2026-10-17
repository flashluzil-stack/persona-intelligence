"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";

/** Localized error screen for unexpected server or rendering errors. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const e = t.errorPage;
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-20">
      <h1 className="text-3xl font-semibold">{e.title}</h1>
      <p className="text-ink-soft">{e.body}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => reset()}>{e.retry}</Button>
        <Link href="/" className="inline-flex h-10 items-center px-2 text-sm text-accent underline-offset-4 hover:underline">
          {e.home}
        </Link>
      </div>
      {error.digest && (
        <p className="text-[12px] text-faint">
          {e.reference} <bdi className="font-mono">{error.digest}</bdi>
        </p>
      )}
    </main>
  );
}
