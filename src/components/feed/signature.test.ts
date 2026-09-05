import { describe, expect, it } from "vitest";

import { SIGNATURE_WIDTH, composeSignature, resampleTo } from "./signature";

describe("resampleTo", () => {
  it("returns exactly the requested width", () => {
    expect(resampleTo([0, 1, 0.5, 0.25, 0.75], 3)).toHaveLength(3);
    expect(resampleTo([0.2, 0.4], 8)).toHaveLength(8);
  });

  it("averages each window rather than sampling one index", () => {
    expect(resampleTo([0, 1, 0, 1], 2)).toEqual([0.5, 0.5]);
  });

  it("keeps every value inside 0..1 and takes the magnitude", () => {
    for (const value of resampleTo([-1, -0.5, 2, 0], 4)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("has nothing to draw for empty input or a zero width", () => {
    expect(resampleTo([], 8)).toEqual([]);
    expect(resampleTo([0.5], 0)).toEqual([]);
  });
});

describe("composeSignature", () => {
  it("draws nothing when there is no audio behind it", () => {
    expect(composeSignature([])).toEqual([]);
    expect(composeSignature([[], []])).toEqual([]);
  });

  it("is exactly SIGNATURE_WIDTH bars wide whatever it is composed from", () => {
    expect(composeSignature([[0.1, 0.9]])).toHaveLength(SIGNATURE_WIDTH);
    expect(composeSignature([[0.1], [0.2], [0.3], [0.4], [0.5]])).toHaveLength(SIGNATURE_WIDTH);
  });

  it("uses at most the twelve most recent Waves", () => {
    const sets = Array.from({ length: 30 }, (_, i) => [i / 30, 1 - i / 30]);
    const signature = composeSignature(sets, 12);
    expect(signature).toHaveLength(12);
    // Each of the twelve sources contributes one bar at width 12, so the
    // thirteenth set can never influence the first bar.
    expect(signature[0]).toBeCloseTo((sets[0][0] + sets[0][1]) / 2, 5);
  });

  it("is deterministic: the same Waves always draw the same signature", () => {
    const sets = [[0.2, 0.8, 0.4], [0.9, 0.1]];
    expect(composeSignature(sets)).toEqual(composeSignature(sets));
  });

  it("skips Waves with no peak data instead of drawing a gap", () => {
    expect(composeSignature([[], [0.5, 0.5]], 4)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });
});
