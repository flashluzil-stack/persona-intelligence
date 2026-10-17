import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/layout/auth-forms";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.forgotTitle };
}

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">{t.auth.forgotTitle}</h1>
        <p className="text-sm text-muted">{t.auth.forgotSubtitle}</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted">
        <Link href="/sign-in" className="underline hover:text-ink">
          {t.auth.backToSignIn}
        </Link>
      </p>
    </>
  );
}
