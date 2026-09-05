import { describe, expect, it } from "vitest";

import { DEFAULT_PEAK_BITS, normalizePeaks, resolveWavePeaks } from "./peaks";

describe("normalizePeaks", () => {
  it("scales 8-bit worker output onto 0..1", () => {
    // `audio_assets.peaks` ships quantised amplitudes at the declared depth:
    // 8 bits means 0..255, and the renderer draws 1 as full trace height.
    expect(normalizePeaks([0, 51, 255], 8)).toEqual([0, 0.2, 1]);
  });

  it("uses full scale, not the loudest sample, so a quiet take stays quiet", () => {
    const quiet = normalizePeaks([0, 20, 40], 8);
    expect(Math.max(...quiet)).toBeCloseTo(40 / 255, 5);
  });

  it("leaves already-normalised data untouched", () => {
    expect(normalizePeaks([0, 0.25, 1], 8)).toEqual([0, 0.25, 1]);
  });

  it("treats negative samples as amplitude", () => {
    expect(normalizePeaks([-255, 255], 8)).toEqual([1, 1]);
  });

  it("survives non-finite values", () => {
    expect(normalizePeaks([Number.NaN, 255], 8)).toEqual([0, 1]);
  });

  it("defaults to the depth the worker writes today", () => {
    expect(DEFAULT_PEAK_BITS).toBe(8);
    expect(normalizePeaks([255])).toEqual([1]);
  });

  it("never returns a value above 1, whatever the depth claim", () => {
    const out = normalizePeaks([1000], 8);
    expect(Math.max(...out)).toBeLessThanOrEqual(1);
  });
});

describe("resolveWavePeaks", () => {
  it("normalises real data through the same path", () => {
    expect(resolveWavePeaks([0, 128, 255], "asset-1", 8)).toEqual([
      0,
      128 / 255,
      1,
    ]);
  });

  it("falls back to a deterministic placeholder when there is no data", () => {
    const a = resolveWavePeaks(null, "asset-1");
    const b = resolveWavePeaks([], "asset-1");
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
  });

  it("gives two different assets two different placeholder shapes", () => {
    expect(resolveWavePeaks(null, "asset-1")).not.toEqual(resolveWavePeaks(null, "asset-2"));
  });

  it("keeps every placeholder amplitude inside the drawable range", () => {
    for (const value of resolveWavePeaks(null, "asset-3")) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
