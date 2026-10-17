import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main id="main" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-5 py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">404</p>
      <h1 className="text-3xl font-semibold">{t.notFound.title}</h1>
      <p className="text-sm text-muted">{t.notFound.body}</p>
      <Link href="/" className="text-sm font-medium text-accent underline">{t.notFound.home}</Link>
    </main>
  );
}
