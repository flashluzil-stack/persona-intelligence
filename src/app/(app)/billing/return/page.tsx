import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PurchaseStatus } from "@/components/billing/purchase-status";
import { PageContainer } from "@/components/layout/site-chrome";
import { getI18n } from "@/i18n/server";
import { requireAuth } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.checkout.verifyingTitle };
}

export default async function BillingReturnPage({ searchParams }: PageProps<"/billing/return">) {
  const sp = await searchParams;
  const purchase = typeof sp.purchase === "string" ? sp.purchase : "";
  if (!uuidSchema.safeParse(purchase).success) notFound();
  await requireAuth(`/billing/return?purchase=${purchase}`);
  const { t } = await getI18n();
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : null;
  return (
    <PageContainer className="max-w-xl space-y-6 py-12">
      <h1 className="text-3xl font-semibold">{t.checkout.verifyingTitle}</h1>
      <PurchaseStatus purchaseId={purchase} next={next} />
      <p className="text-[12.5px] text-muted">{t.checkout.providerName}</p>
    </PageContainer>
  );
}
