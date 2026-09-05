import { describe, expect, it } from "vitest";

import {
  MIN_BAR,
  MIRROR_ALPHA,
  SILENCE_FLOOR,
  UNLOADED_ALPHA,
  geometryFor,
  resamplePeaks,
} from "./waterline";

describe("geometryFor", () => {
  it("uses 2px bars on a baseline for inline traces (16-28px)", () => {
    for (const height of [16, 20, 28]) {
      expect(geometryFor(height)).toEqual({
        bar: 2,
        gap: 1,
        pitch: 3,
        cap: 0,
        mirrored: false,
      });
    }
  });

  it("widens the gap for mini-player traces (32-38px)", () => {
    for (const height of [32, 36, 38]) {
      expect(geometryFor(height)).toEqual({
        bar: 2,
        gap: 2,
        pitch: 4,
        cap: 0,
        mirrored: false,
      });
    }
  });

  it("mirrors with a 1px cap at 40px and above", () => {
    for (const height of [40, 56, 96, 144]) {
      expect(geometryFor(height)).toEqual({
        bar: 3,
        gap: 2,
        pitch: 5,
        cap: 1,
        mirrored: true,
      });
    }
  });

  it("never rounds a cap beyond 1px, at any size", () => {
    for (let height = 8; height <= 400; height += 4) {
      expect(geometryFor(height).cap).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the pitch equal to bar plus gap", () => {
    for (const height of [16, 32, 56, 144]) {
      const geometry = geometryFor(height);
      expect(geometry.pitch).toBe(geometry.bar + geometry.gap);
    }
  });
});

describe("resamplePeaks", () => {
  it("returns exactly the requested number of buckets", () => {
    expect(resamplePeaks([0.1, 0.2, 0.3], 8)).toHaveLength(8);
    expect(resamplePeaks(Array.from({ length: 900 }, () => 0.5), 64)).toHaveLength(64);
  });

  it("takes the peak of each bucket rather than the average", () => {
    // Two buckets over four samples: max(0.1, 0.9) and max(0.2, 0.3).
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
  });

  it("treats negative samples as amplitude", () => {
    expect(resamplePeaks([-0.8, 0.1], 1)).toEqual([0.8]);
  });

  it("clamps above one so a hot peak never overdraws the trace", () => {
    expect(resamplePeaks([4], 1)).toEqual([1]);
  });

  it("yields silence rather than throwing on empty or degenerate input", () => {
    expect(resamplePeaks([], 4)).toEqual([0, 0, 0, 0]);
    expect(resamplePeaks([0.5], 0)).toEqual([]);
  });

  it("ignores values that are not finite", () => {
    expect(resamplePeaks([Number.NaN, 0.4], 1)).toEqual([0.4]);
  });
});

describe("waterline constants", () => {
  it("gives silence a floor rather than a hole", () => {
    expect(MIN_BAR).toBe(2);
  });

  it("shades the mirrored lower half at 70%", () => {
    expect(MIRROR_ALPHA).toBe(0.7);
  });

  it("draws an unloaded region at 40%", () => {
    expect(UNLOADED_ALPHA).toBe(0.4);
  });

  it("keeps the silence threshold low enough that quiet speech still draws bars", () => {
    expect(SILENCE_FLOOR).toBeGreaterThan(0);
    expect(SILENCE_FLOOR).toBeLessThan(0.05);
  });
});
