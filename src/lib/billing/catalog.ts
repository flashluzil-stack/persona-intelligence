import { z } from "zod";

/**
 * Central product catalogue. Everything commercial is configurable:
 * - BILLING_CATALOG_JSON overrides amounts, currency, credits and limits;
 * - PADDLE_PRICE_* environment variables map each product to a Paddle price.
 *
 * The defaults below are a PROPOSAL for review, not final prices. The amount a
 * customer pays is always the Paddle price; displayed amounts must be kept in
 * sync with the Paddle catalogue (see DEPLOY.md).
 */

export const PRODUCT_KEYS = ["single_report", "credits_small", "credits_large", "monthly", "annual"] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

export type ProductKind = "report" | "credits" | "subscription";

export interface Product {
  key: ProductKey;
  kind: ProductKind;
  /** Display amount in minor units (e.g. cents). */
  amountMinor: number;
  currency: string;
  /** Credits granted (credit packs only). */
  credits: number;
  interval: "month" | "year" | null;
  /** Full reports per billing period (subscriptions; fair use). */
  reportsPerPeriod: number | null;
  priceId: string | null;
}

const DEFAULTS: Record<ProductKey, Omit<Product, "key" | "priceId" | "currency">> = {
  single_report: { kind: "report", amountMinor: 900, credits: 0, interval: null, reportsPerPeriod: null },
  credits_small: { kind: "credits", amountMinor: 3500, credits: 5, interval: null, reportsPerPeriod: null },
  credits_large: { kind: "credits", amountMinor: 9000, credits: 15, interval: null, reportsPerPeriod: null },
  monthly: { kind: "subscription", amountMinor: 2900, credits: 0, interval: "month", reportsPerPeriod: 30 },
  // Annual: same fair-use allowance per month, billed yearly at ~2 months free.
  annual: { kind: "subscription", amountMinor: 29000, credits: 0, interval: "year", reportsPerPeriod: 360 },
};

const PRICE_ENV: Record<ProductKey, string> = {
  single_report: "PADDLE_PRICE_SINGLE_REPORT",
  credits_small: "PADDLE_PRICE_CREDITS_SMALL",
  credits_large: "PADDLE_PRICE_CREDITS_LARGE",
  monthly: "PADDLE_PRICE_MONTHLY",
  annual: "PADDLE_PRICE_ANNUAL",
};

const overrideSchema = z.object({
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  products: z
    .record(
      z.enum(PRODUCT_KEYS),
      z.object({
        amountMinor: z.number().int().positive().optional(),
        credits: z.number().int().min(0).optional(),
        reportsPerPeriod: z.number().int().positive().nullable().optional(),
      }),
    )
    .optional(),
});

export function getCatalog(env: Record<string, string | undefined> = process.env): Record<ProductKey, Product> {
  let overrides: z.infer<typeof overrideSchema> = {};
  if (env.BILLING_CATALOG_JSON) {
    const parsed = overrideSchema.safeParse(JSON.parse(env.BILLING_CATALOG_JSON));
    if (!parsed.success) throw new Error("BILLING_CATALOG_JSON is invalid");
    overrides = parsed.data;
  }
  const currency = (overrides.currency ?? env.BILLING_CURRENCY ?? "USD").toUpperCase();
  const out = {} as Record<ProductKey, Product>;
  for (const key of PRODUCT_KEYS) {
    const base = DEFAULTS[key];
    const o = overrides.products?.[key] ?? {};
    out[key] = {
      key,
      ...base,
      amountMinor: o.amountMinor ?? base.amountMinor,
      credits: o.credits ?? base.credits,
      reportsPerPeriod: o.reportsPerPeriod === undefined ? base.reportsPerPeriod : o.reportsPerPeriod,
      currency,
      priceId: env[PRICE_ENV[key]] || null,
    };
  }
  return out;
}

export function productByPriceId(priceId: string, catalog = getCatalog()): Product | null {
  return Object.values(catalog).find((p) => p.priceId === priceId) ?? null;
}

/** Savings of the annual plan versus 12 monthly payments, in whole percent. */
export function annualSavingsPercent(catalog = getCatalog()): number {
  const yearOfMonthly = catalog.monthly.amountMinor * 12;
  if (yearOfMonthly <= 0) return 0;
  return Math.max(0, Math.round((1 - catalog.annual.amountMinor / yearOfMonthly) * 100));
}

/** Fair-use allowance for one billing period of a subscription product. */
export function periodReportLimit(product: Product): number {
  return product.reportsPerPeriod ?? 30;
}

export function priceEnvName(key: ProductKey): string {
  return PRICE_ENV[key];
}
