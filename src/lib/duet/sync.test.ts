import { describe, expect, it } from "vitest";

import { computeBaseOffsetMs, computePreviewSchedule, resolveOffsetMs } from "./sync";

describe("computeBaseOffsetMs", () => {
  it("rounds and floors at zero", () => {
    expect(computeBaseOffsetMs(1234.6)).toBe(1235);
    expect(computeBaseOffsetMs(-50)).toBe(0);
    expect(computeBaseOffsetMs(Number.NaN)).toBe(0);
  });
});

describe("resolveOffsetMs", () => {
  it("adds a positive nudge to the base offset", () => {
    expect(resolveOffsetMs(1000, 500)).toBe(1500);
  });

  it("allows the nudge to push the result negative", () => {
    expect(resolveOffsetMs(200, -700)).toBe(-500);
  });

  it("clamps the nudge component to +/-10s before adding", () => {
    expect(resolveOffsetMs(0, -999_999)).toBe(-10_000);
  });
});

describe("computePreviewSchedule", () => {
  it("mirrors buildDuetMixFilterComplex's delay assignment for a positive offset", () => {
    expect(computePreviewSchedule(1200)).toEqual({ referenceDelayMs: 0, contributionDelayMs: 1200 });
  });

  it("mirrors buildDuetMixFilterComplex's delay assignment for a negative offset", () => {
    expect(computePreviewSchedule(-800)).toEqual({ referenceDelayMs: 800, contributionDelayMs: 0 });
  });

  it("delays neither at zero offset", () => {
    expect(computePreviewSchedule(0)).toEqual({ referenceDelayMs: 0, contributionDelayMs: 0 });
  });
});
