import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";
import { getLegal } from "@/i18n/legal";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: getLegal(locale).privacy.title };
}

export default async function PrivacyPage() {
  const { locale } = await getI18n();
  return <LegalPage doc={getLegal(locale).privacy} />;
}
