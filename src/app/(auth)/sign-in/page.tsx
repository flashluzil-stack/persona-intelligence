import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm, SocialButtons } from "@/components/layout/auth-forms";
import { Notice } from "@/components/ui/primitives";
import { getI18n } from "@/i18n/server";
import { getAuth } from "@/lib/auth";
import { getEnabledSocialProviders } from "@/lib/auth-providers";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signInTitle };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const { t } = await getI18n();
  const next = typeof params.next === "string" ? params.next : undefined;
  const [providers, auth] = await Promise.all([getEnabledSocialProviders(), getAuth()]);
  const notice =
    params.error === "link"
      ? t.auth.linkExpired
      : params.error === "oauth"
        ? t.auth.oauthFailed
        : params.error === "provider"
          ? t.auth.errors.providerDisabled
          : params.error === "rate"
            ? t.auth.errors.tooManyAttempts
            : undefined;
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">{t.auth.signInTitle}</h1>
        <p className="text-sm text-muted">{t.auth.signInSubtitle}</p>
      </div>
      {auth?.user.is_anonymous && <Notice tone="info">{t.auth.guestKeepsReports}</Notice>}
      <SocialButtons providers={providers} next={next} />
      <SignInForm next={next} notice={notice} />
      <p className="text-center text-sm text-muted">
        {t.auth.newHere}{" "}
        <Link href={`/sign-up${nextQuery}`} className="font-medium text-ink underline">
          {t.auth.createAccountLink}
        </Link>
      </p>
    </>
  );
}
