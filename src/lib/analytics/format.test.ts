import { describe, expect, it } from "vitest";

import { formatAvgListenTime, formatPercent, formatRatio } from "./format";

describe("formatPercent", () => {
  it("formats a fraction as a percentage with one decimal by default", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("respects a custom fraction-digit count", () => {
    expect(formatPercent(0.1234, 0)).toBe("12%");
    expect(formatPercent(0.5, 2)).toBe("50.00%");
  });

  it("clamps out-of-range values instead of showing something like 140%", () => {
    expect(formatPercent(1.4)).toBe("100.0%");
    expect(formatPercent(-0.2)).toBe("0.0%");
  });

  it("never throws on NaN/Infinity — falls back to 0%", () => {
    expect(formatPercent(Number.NaN)).toBe("0%");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("0%");
  });
});

describe("formatRatio", () => {
  it("formats with two decimals by default", () => {
    expect(formatRatio(0.4231)).toBe("0.42");
    expect(formatRatio(3)).toBe("3.00");
  });

  it("floors a negative or invalid value to 0", () => {
    expect(formatRatio(-1)).toBe("0.00");
    expect(formatRatio(Number.NaN)).toBe("0.00");
  });
});

describe("formatAvgListenTime", () => {
  it("formats seconds using mm:ss", () => {
    expect(formatAvgListenTime(65)).toBe("1:05");
    expect(formatAvgListenTime(0)).toBe("0:00");
  });

  it("shows an honest 'no data yet' instead of a fake 0:00 when null", () => {
    expect(formatAvgListenTime(null)).toBe("No data yet");
  });

  it("treats a negative or non-finite value as no data too", () => {
    expect(formatAvgListenTime(-5)).toBe("No data yet");
    expect(formatAvgListenTime(Number.NaN)).toBe("No data yet");
  });
});
