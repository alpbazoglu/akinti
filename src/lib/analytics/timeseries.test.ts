import { describe, expect, it } from "vitest";

import type { CreatorAnalyticsDay } from "@/types/domain";

import { fillAnalyticsTimeseriesGaps } from "./timeseries";

const TODAY = new Date("2026-09-04T12:00:00.000Z");

function day(overrides: Partial<CreatorAnalyticsDay> & { day: string }): CreatorAnalyticsDay {
  return {
    plays: 0,
    uniqueListeners: 0,
    replays: 0,
    saves: 0,
    comments: 0,
    shares: 0,
    newFollowers: 0,
    ...overrides,
  };
}

describe("fillAnalyticsTimeseriesGaps", () => {
  it("returns exactly `days` entries ending today, oldest first", () => {
    const filled = fillAnalyticsTimeseriesGaps([], 7, TODAY);
    expect(filled).toHaveLength(7);
    expect(filled[0]!.day).toBe("2026-08-29");
    expect(filled[6]!.day).toBe("2026-09-04");
  });

  it("zero-fills every missing day", () => {
    const filled = fillAnalyticsTimeseriesGaps([], 7, TODAY);
    for (const entry of filled) {
      expect(entry).toEqual(
        day({
          day: entry.day,
        }),
      );
    }
  });

  it("keeps the real row for a day that has data instead of zeroing it", () => {
    const withData = [day({ day: "2026-09-02", plays: 12, uniqueListeners: 5 })];
    const filled = fillAnalyticsTimeseriesGaps(withData, 7, TODAY);
    const sep2 = filled.find((entry) => entry.day === "2026-09-02");
    expect(sep2).toEqual(withData[0]);
  });

  it("does not invent a day outside the requested window", () => {
    const outOfRange = [day({ day: "2020-01-01", plays: 999 })];
    const filled = fillAnalyticsTimeseriesGaps(outOfRange, 7, TODAY);
    expect(filled.some((entry) => entry.day === "2020-01-01")).toBe(false);
    expect(filled.every((entry) => entry.plays !== 999)).toBe(true);
  });

  it("supports the 30- and 90-day windows", () => {
    expect(fillAnalyticsTimeseriesGaps([], 30, TODAY)).toHaveLength(30);
    expect(fillAnalyticsTimeseriesGaps([], 90, TODAY)).toHaveLength(90);
  });

  it("dates are consecutive with no gaps or duplicates", () => {
    const filled = fillAnalyticsTimeseriesGaps([], 30, TODAY);
    const dates = filled.map((entry) => entry.day);
    expect(new Set(dates).size).toBe(dates.length);
    for (let i = 1; i < dates.length; i += 1) {
      const prev = new Date(`${dates[i - 1]}T00:00:00.000Z`);
      const curr = new Date(`${dates[i]}T00:00:00.000Z`);
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });
});
