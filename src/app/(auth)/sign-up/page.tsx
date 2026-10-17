import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm, SocialButtons } from "@/components/layout/auth-forms";
import { Notice } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";
import { getAuth } from "@/lib/auth";
import { getEnabledSocialProviders } from "@/lib/auth-providers";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signUpTitle };
}

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  const { t } = await getI18n();
  const next = typeof params.next === "string" ? params.next : undefined;
  const [providers, auth] = await Promise.all([getEnabledSocialProviders(), getAuth()]);
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">{t.auth.signUpTitle}</h1>
        <p className="text-sm text-muted">{t.auth.signUpSubtitle}</p>
      </div>
      {auth?.user.is_anonymous && <Notice tone="info">{t.auth.guestKeepsReports}</Notice>}
      <SocialButtons providers={providers} next={next} />
      <SignUpForm next={next} />
      <p className="text-center text-sm text-muted">
        {t.auth.haveAccount}{" "}
        <Link href={`/sign-in${nextQuery}`} className="font-medium text-ink underline">
          {t.auth.signInLink}
        </Link>
      </p>
    </>
  );
}
