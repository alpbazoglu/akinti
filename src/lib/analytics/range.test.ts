import { describe, expect, it } from "vitest";

import { ANALYTICS_RANGE_OPTIONS, analyticsRangeSchema, parseAnalyticsRangeDays } from "./range";

describe("analyticsRangeSchema", () => {
  it("accepts 7, 30 and 90", () => {
    expect(analyticsRangeSchema.safeParse(7).success).toBe(true);
    expect(analyticsRangeSchema.safeParse(30).success).toBe(true);
    expect(analyticsRangeSchema.safeParse(90).success).toBe(true);
  });

  it("rejects any other number", () => {
    expect(analyticsRangeSchema.safeParse(14).success).toBe(false);
    expect(analyticsRangeSchema.safeParse(0).success).toBe(false);
    expect(analyticsRangeSchema.safeParse(365).success).toBe(false);
    expect(analyticsRangeSchema.safeParse(-30).success).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(analyticsRangeSchema.safeParse("30").success).toBe(false);
    expect(analyticsRangeSchema.safeParse(null).success).toBe(false);
    expect(analyticsRangeSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("parseAnalyticsRangeDays", () => {
  it("parses a numeric string search param", () => {
    expect(parseAnalyticsRangeDays("7")).toBe(7);
    expect(parseAnalyticsRangeDays("90")).toBe(90);
  });

  it("falls back to the default (30) for a missing/invalid value, never throws", () => {
    expect(parseAnalyticsRangeDays(undefined)).toBe(30);
    expect(parseAnalyticsRangeDays(null)).toBe(30);
    expect(parseAnalyticsRangeDays("")).toBe(30);
    expect(parseAnalyticsRangeDays("not-a-number")).toBe(30);
    expect(parseAnalyticsRangeDays("14")).toBe(30);
    expect(parseAnalyticsRangeDays(-7)).toBe(30);
  });

  it("accepts a raw number too", () => {
    expect(parseAnalyticsRangeDays(7)).toBe(7);
  });
});

describe("ANALYTICS_RANGE_OPTIONS", () => {
  it("has exactly one option per allowed range, in order", () => {
    expect(ANALYTICS_RANGE_OPTIONS.map((o) => o.value)).toEqual([7, 30, 90]);
  });
});
