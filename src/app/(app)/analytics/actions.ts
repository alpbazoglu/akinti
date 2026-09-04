"use server";

import { redirect } from "next/navigation";

import { routes } from "@/config/routes";
import { parseAnalyticsRangeDays } from "@/lib/analytics/range";

/**
 * Bound Server Action backing the range switcher on both `/analytics` and
 * `/analytics/health` (`src/components/analytics/RangeSwitcher.tsx`). Each
 * range button submits its own `<form action={setAnalyticsRange.bind(null,
 * section, days)}>` — no client JS required, so the switcher works with
 * JavaScript disabled too. `days` is re-validated here (never trusted from
 * the bound argument alone) and an invalid value degrades to the default
 * range rather than erroring.
 */
export async function setAnalyticsRange(section: "creator" | "health", days: number): Promise<never> {
  const range = parseAnalyticsRangeDays(days);
  redirect(section === "health" ? routes.analyticsHealth(range) : routes.analytics(range));
}
