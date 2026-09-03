import { describe, expect, it } from "vitest";

import { formatCount, formatDuration, initialsOf, timeAgo } from "./format";

describe("formatDuration", () => {
  it("formats sub-minute durations with a padded seconds field", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(59)).toBe("0:59");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(214)).toBe("3:34");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("adds an hours field past an hour", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(36000)).toBe("10:00:00");
  });

  it("truncates fractional seconds rather than rounding up", () => {
    expect(formatDuration(9.9)).toBe("0:09");
  });

  it("falls back to 0:00 for invalid input", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("formatCount", () => {
  it("shows small counts verbatim", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1)).toBe("1");
    expect(formatCount(999)).toBe("999");
  });

  it("compacts thousands with one decimal below ten", () => {
    expect(formatCount(1000)).toBe("1K");
    expect(formatCount(1200)).toBe("1.2K");
    expect(formatCount(1284)).toBe("1.2K");
    expect(formatCount(9999)).toBe("9.9K");
  });

  it("drops the decimal at ten thousand and above", () => {
    expect(formatCount(10_000)).toBe("10K");
    expect(formatCount(12_840)).toBe("12K");
    expect(formatCount(999_999)).toBe("999K");
  });

  it("compacts millions and billions", () => {
    expect(formatCount(1_000_000)).toBe("1M");
    expect(formatCount(1_284_000)).toBe("1.2M");
    expect(formatCount(2_500_000_000)).toBe("2.5B");
  });

  it("never rounds a count upward", () => {
    expect(formatCount(1999)).toBe("1.9K");
  });

  it("falls back to 0 for invalid input", () => {
    expect(formatCount(-10)).toBe("0");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-06-15T12:00:00.000Z").getTime();
  const ago = (ms: number) => timeAgo(now - ms, now);

  it("reads as now inside the first minute", () => {
    expect(ago(0)).toBe("now");
    expect(ago(59_000)).toBe("now");
  });

  it("counts minutes, hours and days", () => {
    expect(ago(60_000)).toBe("1m");
    expect(ago(47 * 60_000)).toBe("47m");
    expect(ago(3 * 3_600_000)).toBe("3h");
    expect(ago(3 * 86_400_000)).toBe("3d");
  });

  it("counts weeks, months and years", () => {
    expect(ago(14 * 86_400_000)).toBe("2w");
    expect(ago(60 * 86_400_000)).toBe("2mo");
    expect(ago(800 * 86_400_000)).toBe("2y");
  });

  it("accepts Date and ISO string input", () => {
    expect(timeAgo(new Date(now - 3_600_000), now)).toBe("1h");
    expect(timeAgo(new Date(now - 3_600_000).toISOString(), now)).toBe("1h");
  });

  it("reads as now for future and invalid timestamps", () => {
    expect(timeAgo(now + 60_000, now)).toBe("now");
    expect(timeAgo("not a date", now)).toBe("now");
  });
});

describe("initialsOf", () => {
  it("uses the first letter of the first two words", () => {
    expect(initialsOf("Akin Yilmaz")).toBe("AY");
    expect(initialsOf("maria_lopez")).toBe("ML");
  });

  it("falls back to the first two characters of a single word", () => {
    expect(initialsOf("akin")).toBe("AK");
    expect(initialsOf("@deniz")).toBe("DE");
  });

  it("handles empty input", () => {
    expect(initialsOf("   ")).toBe("?");
  });
});
