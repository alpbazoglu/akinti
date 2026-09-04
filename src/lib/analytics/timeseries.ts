/**
 * `creator_timeseries` (migration `20260903140500_creator_analytics.sql`)
 * only returns a row for a day that had at least one event — scaffolding
 * every calendar day in SQL for a Wave-less creator would mean N empty rows
 * for nothing. This is the client-side complement: it turns that sparse list
 * into exactly `days` consecutive calendar days (UTC, ending "today"), zero
 * filling anything the RPC didn't return, so the chart never has a gap.
 */

import type { AnalyticsRangeDays, CreatorAnalyticsDay } from "@/types/domain";

function zeroDay(day: string): CreatorAnalyticsDay {
  return {
    day,
    plays: 0,
    uniqueListeners: 0,
    replays: 0,
    saves: 0,
    comments: 0,
    shares: 0,
    newFollowers: 0,
  };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fill gaps in a sparse daily series so it has exactly `days` entries, oldest
 * first, ending on `today` (defaults to `new Date()`, injectable for tests).
 * Days are compared/generated in UTC to avoid the local-timezone rollover
 * `Date` math would otherwise introduce.
 */
export function fillAnalyticsTimeseriesGaps(
  rows: readonly CreatorAnalyticsDay[],
  days: AnalyticsRangeDays,
  today: Date = new Date(),
): CreatorAnalyticsDay[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const filled: CreatorAnalyticsDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(end);
    cursor.setUTCDate(cursor.getUTCDate() - offset);
    const key = isoDate(cursor);
    filled.push(byDay.get(key) ?? zeroDay(key));
  }
  return filled;
}
