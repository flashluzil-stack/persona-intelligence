import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/layout/auth-forms";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.resetTitle };
}

export default async function ResetPasswordPage() {
  const { t } = await getI18n();
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">{t.auth.resetTitle}</h1>
      </div>
      <ResetPasswordForm />
    </>
  );
}
