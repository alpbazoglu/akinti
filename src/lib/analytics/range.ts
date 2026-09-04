import { z } from "zod";

import { ANALYTICS_RANGE_DAYS, type AnalyticsRangeDays } from "@/types/domain";

/**
 * The only windows `creator_overview`/`creator_timeseries`/
 * `creator_wave_performance`/`product_health` accept — mirrors each RPC's
 * own `p_days not in (7, 30, 90)` guard (migration
 * `20260903140500_creator_analytics.sql`) so a bad value is rejected before
 * it ever reaches the network, not just by the database.
 */
export const analyticsRangeSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);

export const DEFAULT_ANALYTICS_RANGE_DAYS: AnalyticsRangeDays = 30;

/**
 * Parse a range from an untrusted source (a URL search param, form input) —
 * anything that isn't exactly 7, 30 or 90 falls back to the default rather
 * than throwing, since a malformed `?days=` query string should degrade to
 * "show me the usual view", not a broken page.
 */
export function parseAnalyticsRangeDays(value: unknown): AnalyticsRangeDays {
  const numeric = typeof value === "string" ? Number(value) : value;
  const parsed = analyticsRangeSchema.safeParse(numeric);
  return parsed.success ? parsed.data : DEFAULT_ANALYTICS_RANGE_DAYS;
}

export const ANALYTICS_RANGE_OPTIONS: readonly { value: AnalyticsRangeDays; label: string }[] =
  ANALYTICS_RANGE_DAYS.map((days) => ({ value: days, label: `${days} days` }));
