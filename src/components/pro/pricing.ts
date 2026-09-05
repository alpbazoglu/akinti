/**
 * AKINTI Pro pricing helpers (Wave F, PRODUCT_V2 §4/§5/§6). Pure and
 * server/client-agnostic so both `page.tsx` and `ProScreen.tsx` can share
 * them without pulling anything Supabase-shaped into the client bundle.
 */

import type { PlanCode } from "@/types/database";

export type ProCurrency = "TRY" | "USD";
export type ProInterval = "month" | "year";

/**
 * The founder's already-decided monthly prices (PRODUCT_V2 §5/§6:
 * ₺79.99/month TR, $4.99/month international), in minor units — mirrors
 * `scripts/seed-plans.ts`'s `MONTHLY_TRY_AMOUNT`/`MONTHLY_USD_AMOUNT`. Used
 * only as the not-subscribed screen's monthly display when `plans` hasn't
 * been seeded yet in this environment; a real seeded row always wins (see
 * `resolvePlanAmount`).
 */
export const DECIDED_MONTHLY_AMOUNT: Record<ProCurrency, number> = { TRY: 7999, USD: 499 };

export function planCodeFor(currency: ProCurrency, interval: ProInterval): PlanCode {
  if (currency === "TRY") return interval === "month" ? "pro_monthly_try" : "pro_yearly_try";
  return interval === "month" ? "pro_monthly_usd" : "pro_yearly_usd";
}

/**
 * TRY when the profile's own locale says Turkish, or (client-side only,
 * `locale` omitted) the browser's own language is `tr` — PRODUCT_V2 §4's "TR
 * -> iyzico" rule, decided once, up front, never re-derived per click.
 * `profiles` carries no locale column yet, so the "profile" half of that
 * rule reduces to whatever `locale` the caller passes in (today, always
 * undefined) until one exists.
 */
export function detectProCurrency(locale?: string | null): ProCurrency {
  if (locale && locale.toLowerCase().startsWith("tr")) return "TRY";
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("tr")) {
    return "TRY";
  }
  return "USD";
}

export interface ProPlanSummary {
  readonly code: PlanCode;
  /** Minor units (kuruş/cents). */
  readonly amount: number;
  readonly currency: ProCurrency;
  readonly interval: ProInterval;
}

/**
 * The real amount for `currency`/`interval` if `scripts/seed-plans.ts` has
 * seeded that row, else the decided monthly default for a monthly plan, else
 * `null` — a yearly price is never guessed (docs/BILLING.md "Seeding
 * plans": the annual discount is not decided yet), so an unseeded yearly
 * plan has no amount to show at all.
 */
export function resolvePlanAmount(
  plans: readonly ProPlanSummary[],
  currency: ProCurrency,
  interval: ProInterval,
): number | null {
  const seeded = plans.find((plan) => plan.currency === currency && plan.interval === interval);
  if (seeded) return seeded.amount;
  return interval === "month" ? DECIDED_MONTHLY_AMOUNT[currency] : null;
}

/** `true` only when a real (seeded) yearly plan exists for `currency` — the yearly toggle is hidden otherwise, never shown with a guessed price. */
export function hasSeededYearlyPlan(plans: readonly ProPlanSummary[], currency: ProCurrency): boolean {
  return plans.some((plan) => plan.currency === currency && plan.interval === "year");
}

/** `$4.99` / `₺79,99` — the currency-formatted major-unit amount, locale-correct decimal/grouping. Martian Mono renders the numerals; this string is the whole readout, including the symbol. */
export function formatProPrice(amountMinorUnits: number, currency: ProCurrency): string {
  const locale = currency === "TRY" ? "tr-TR" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(
    amountMinorUnits / 100,
  );
}
