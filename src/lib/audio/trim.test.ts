import { describe, expect, it } from "vitest";

import {
  MIN_TRIMMED_MS,
  clampTrim,
  fullRange,
  isTrimmed,
  msAtRatio,
  nearestHandle,
  ratioOf,
  trimmedDurationMs,
} from "./trim";

describe("fullRange", () => {
  it("spans the whole take", () => {
    expect(fullRange(12_000)).toEqual({ startMs: 0, endMs: 12_000 });
  });

  it("never goes negative for a bad duration", () => {
    expect(fullRange(-500)).toEqual({ startMs: 0, endMs: 0 });
  });
});

describe("trimmedDurationMs / isTrimmed", () => {
  it("measures the kept span", () => {
    expect(trimmedDurationMs({ startMs: 1000, endMs: 4000 })).toBe(3000);
  });

  it("never reports a negative span for a crossed range", () => {
    expect(trimmedDurationMs({ startMs: 5000, endMs: 1000 })).toBe(0);
  });

  it("is false for the untouched full range", () => {
    expect(isTrimmed(fullRange(10_000), 10_000)).toBe(false);
  });

  it("is true once either handle moves off an end", () => {
    expect(isTrimmed({ startMs: 500, endMs: 10_000 }, 10_000)).toBe(true);
    expect(isTrimmed({ startMs: 0, endMs: 9000 }, 10_000)).toBe(true);
  });
});

describe("clampTrim", () => {
  const DURATION = 10_000;

  it("keeps an already-valid range untouched", () => {
    expect(clampTrim({ startMs: 1000, endMs: 8000 }, DURATION)).toEqual({
      startMs: 1000,
      endMs: 8000,
    });
  });

  it("clamps a range that overruns the take", () => {
    expect(clampTrim({ startMs: -500, endMs: DURATION + 5000 }, DURATION)).toEqual({
      startMs: 0,
      endMs: DURATION,
    });
  });

  it("collapses to the full range when the take itself is at or below the minimum", () => {
    expect(clampTrim({ startMs: 100, endMs: 200 }, 800)).toEqual(fullRange(800));
  });

  it("when the start handle moved past the end, shortens from the front and pushes the end out just enough", () => {
    const result = clampTrim({ startMs: 9500, endMs: 9600 }, DURATION, "start");
    expect(trimmedDurationMs(result)).toBe(MIN_TRIMMED_MS);
    // The moved handle (start) is the one honoured; the untouched end gives way.
    expect(result.startMs).toBe(9000);
    expect(result.endMs).toBe(10_000);
  });

  it("when the end handle moved past the start, shortens from the back and pulls the start in just enough", () => {
    const result = clampTrim({ startMs: 400, endMs: 300 }, DURATION, "end");
    expect(trimmedDurationMs(result)).toBe(MIN_TRIMMED_MS);
    expect(result.endMs).toBe(1000);
    expect(result.startMs).toBe(0);
  });

  it("never returns a range outside [0, duration]", () => {
    const result = clampTrim({ startMs: -100, endMs: 50 }, DURATION, "end");
    expect(result.startMs).toBeGreaterThanOrEqual(0);
    expect(result.endMs).toBeLessThanOrEqual(DURATION);
  });
});

describe("ratioOf / msAtRatio", () => {
  it("round-trip through the middle of the take", () => {
    expect(ratioOf(5000, 10_000)).toBe(0.5);
    expect(msAtRatio(0.5, 10_000)).toBe(5000);
  });

  it("clamps ratioOf to [0, 1]", () => {
    expect(ratioOf(-100, 10_000)).toBe(0);
    expect(ratioOf(20_000, 10_000)).toBe(1);
  });

  it("clamps msAtRatio's ratio input to [0, 1]", () => {
    expect(msAtRatio(-1, 10_000)).toBe(0);
    expect(msAtRatio(2, 10_000)).toBe(10_000);
  });

  it("is 0 for a zero or unknown duration", () => {
    expect(ratioOf(500, 0)).toBe(0);
    expect(msAtRatio(0.5, 0)).toBe(0);
  });
});

describe("nearestHandle", () => {
  const range = { startMs: 1000, endMs: 9000 };
  const DURATION = 10_000;

  it("picks the start handle when the tap is closer to it", () => {
    expect(nearestHandle(ratioOf(1500, DURATION), range, DURATION)).toBe("start");
  });

  it("picks the end handle when the tap is closer to it", () => {
    expect(nearestHandle(ratioOf(8500, DURATION), range, DURATION)).toBe("end");
  });

  it("breaks an exact tie toward the start handle", () => {
    const midpoint = (ratioOf(1000, DURATION) + ratioOf(9000, DURATION)) / 2;
    expect(nearestHandle(midpoint, range, DURATION)).toBe("start");
  });
});
