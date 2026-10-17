import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/i18n/format";
import { annualSavingsPercent, getCatalog, type Product, type ProductKey } from "./catalog";

/** Display-ready offers derived from the central catalogue (formatted on the server). */
export interface Offer {
  key: ProductKey;
  kind: Product["kind"];
  price: string;
  credits: number;
  interval: Product["interval"];
  reportsPerPeriod: number | null;
  /** Per-report price for credit packs; effective monthly price for the annual plan. */
  unitPrice: string | null;
  /** True when this product has a Paddle price configured. */
  purchasable: boolean;
}

export function getOffers(locale: Locale, paymentsEnabled: boolean): { offers: Record<ProductKey, Offer>; annualSavings: number } {
  const catalog = getCatalog();
  const offers = {} as Record<ProductKey, Offer>;
  for (const p of Object.values(catalog)) {
    let unitPrice: string | null = null;
    if (p.kind === "credits" && p.credits > 0) unitPrice = formatMoney(Math.round(p.amountMinor / p.credits), p.currency, locale);
    if (p.interval === "year") unitPrice = formatMoney(Math.round(p.amountMinor / 12), p.currency, locale);
    offers[p.key] = {
      key: p.key,
      kind: p.kind,
      price: formatMoney(p.amountMinor, p.currency, locale),
      credits: p.credits,
      interval: p.interval,
      reportsPerPeriod: p.reportsPerPeriod,
      unitPrice,
      purchasable: paymentsEnabled && Boolean(p.priceId),
    };
  }
  return { offers, annualSavings: annualSavingsPercent(catalog) };
}
