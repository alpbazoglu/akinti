/**
 * Creator analytics + product health (spec §27, §28, migration
 * `20260903140500_creator_analytics.sql`). Every RPC here is read-only and
 * resolves its own scope server-side — `creator_overview`/
 * `creator_timeseries`/`creator_wave_performance` always answer for
 * `auth.uid()`'s own Waves (there is no creator-id argument to forge), and
 * `product_health` is gated by `is_moderator()` re-checked inside the
 * function itself. This module only shapes the call and maps the row back
 * to the domain types in `@/types/domain` — it is not the authorization
 * boundary.
 */

import { z } from "zod";

import { analyticsRangeSchema } from "@/lib/analytics/range";
import type {
  CreatorAnalyticsDay,
  CreatorAnalyticsOverview,
  CreatorWavePerformance,
  ProductHealth,
} from "@/types/domain";

import type { Db } from "./types";
import { unwrap, unwrapList } from "./types";

export { analyticsRangeSchema };

/** `creator_wave_performance`'s `p_limit`, clamped the same way the RPC itself clamps it (1–100). */
export const waveLimitSchema = z.number().int().min(1).max(100).default(20);

function toCreatorOverview(row: {
  plays: number;
  unique_listeners: number;
  replays: number;
  saves: number;
  shares: number;
  comments: number;
  duets: number;
  avg_listen_seconds: number | null;
  completion_rate: number;
  follower_delta: number;
}): CreatorAnalyticsOverview {
  return {
    plays: row.plays,
    uniqueListeners: row.unique_listeners,
    replays: row.replays,
    saves: row.saves,
    shares: row.shares,
    comments: row.comments,
    duets: row.duets,
    avgListenSeconds: row.avg_listen_seconds,
    completionRate: row.completion_rate,
    followerDelta: row.follower_delta,
  };
}

function toCreatorAnalyticsDay(row: {
  day: string;
  plays: number;
  unique_listeners: number;
  replays: number;
  saves: number;
  comments: number;
  shares: number;
  new_followers: number;
}): CreatorAnalyticsDay {
  return {
    day: row.day,
    plays: row.plays,
    uniqueListeners: row.unique_listeners,
    replays: row.replays,
    saves: row.saves,
    comments: row.comments,
    shares: row.shares,
    newFollowers: row.new_followers,
  };
}

function toCreatorWavePerformance(row: {
  wave_id: string;
  title: string;
  creation_type: CreatorWavePerformance["creationType"];
  published_at: string;
  plays: number;
  replays: number;
  saves: number;
  comments: number;
  shares: number;
  completion_rate: number;
}): CreatorWavePerformance {
  return {
    waveId: row.wave_id,
    title: row.title,
    creationType: row.creation_type,
    publishedAt: row.published_at,
    plays: row.plays,
    replays: row.replays,
    saves: row.saves,
    comments: row.comments,
    shares: row.shares,
    completionRate: row.completion_rate,
  };
}

function toProductHealth(row: {
  activation_rate: number;
  week1_returning_listener_rate: number;
  week4_returning_listener_rate: number;
  week1_returning_creator_rate: number;
  week4_returning_creator_rate: number;
  duet_requests_per_active_user: number;
  duet_acceptance_rate: number;
  duets_per_week: number;
  discovery_share: number;
  content_velocity: number;
}): ProductHealth {
  return {
    activationRate: row.activation_rate,
    week1ReturningListenerRate: row.week1_returning_listener_rate,
    week4ReturningListenerRate: row.week4_returning_listener_rate,
    week1ReturningCreatorRate: row.week1_returning_creator_rate,
    week4ReturningCreatorRate: row.week4_returning_creator_rate,
    duetRequestsPerActiveUser: row.duet_requests_per_active_user,
    duetAcceptanceRate: row.duet_acceptance_rate,
    duetsPerWeek: row.duets_per_week,
    discoveryShare: row.discovery_share,
    contentVelocity: row.content_velocity,
  };
}

/** Totals over the window for the signed-in creator's own Waves. */
export async function getCreatorOverview(db: Db, days: number): Promise<CreatorAnalyticsOverview> {
  const p_days = analyticsRangeSchema.parse(days);
  const result = await db.rpc("creator_overview", { p_days });
  const rows = unwrapList("getCreatorOverview", result);
  const row = rows[0];
  if (!row) {
    throw new Error("creator_overview returned no row");
  }
  return toCreatorOverview(row);
}

/** Daily breakdown, one row per day with any activity. Gap-fill with `fillAnalyticsTimeseriesGaps`. */
export async function getCreatorTimeseries(db: Db, days: number): Promise<CreatorAnalyticsDay[]> {
  const p_days = analyticsRangeSchema.parse(days);
  const result = await db.rpc("creator_timeseries", { p_days });
  const rows = unwrapList("getCreatorTimeseries", result);
  return rows.map(toCreatorAnalyticsDay);
}

/** Per-Wave performance, ranked by plays. Every owned Wave is included, even with zero plays. */
export async function getCreatorWavePerformance(
  db: Db,
  days: number,
  limit = 20,
): Promise<CreatorWavePerformance[]> {
  const p_days = analyticsRangeSchema.parse(days);
  const p_limit = waveLimitSchema.parse(limit);
  const result = await db.rpc("creator_wave_performance", { p_days, p_limit });
  const rows = unwrapList("getCreatorWavePerformance", result);
  return rows.map(toCreatorWavePerformance);
}

/**
 * Platform-wide product health (spec §28). Moderator-only — `product_health`
 * raises if the caller isn't one, so this throws rather than returning an
 * empty/default result; callers should only reach this after their own
 * `isModerator()` UI gate (see `src/app/(app)/analytics/health/page.tsx`),
 * exactly like `src/app/(app)/moderation/page.tsx` does for the queue.
 */
export async function getProductHealth(db: Db, days: number): Promise<ProductHealth> {
  const p_days = analyticsRangeSchema.parse(days);
  const result = await db.rpc("product_health", { p_days });
  const rows = unwrapList("getProductHealth", result);
  const row = rows[0];
  if (!row) {
    throw new Error("product_health returned no row");
  }
  return toProductHealth(row);
}

/** Thin wrapper over `is_moderator()` for the `/analytics/health` gate — mirrors `src/lib/db/moderation.ts`. */
export async function isModeratorForAnalytics(db: Db): Promise<boolean> {
  const result = await db.rpc("is_moderator");
  return unwrap("isModeratorForAnalytics", result);
}
