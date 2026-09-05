import { describe, expect, it } from "vitest";

import {
  A4_HZ,
  CLIPPING_DB,
  IN_TUNE_CENTS,
  LEVEL_FLOOR_DB,
  MAX_PITCH_HZ,
  MIN_PITCH_CLARITY,
  MIN_PITCH_HZ,
  describePitch,
  formatDb,
  formatPitch,
  frequencyToMidi,
  isUsablePitch,
  rmsToDb,
} from "./pitch";

describe("isUsablePitch", () => {
  it("accepts a confident reading inside the sung range", () => {
    expect(isUsablePitch(A4_HZ, MIN_PITCH_CLARITY)).toBe(true);
  });

  it("rejects a reading below the confidence threshold", () => {
    expect(isUsablePitch(A4_HZ, MIN_PITCH_CLARITY - 0.01)).toBe(false);
  });

  it("rejects a frequency outside the sung range even with perfect clarity", () => {
    expect(isUsablePitch(MIN_PITCH_HZ - 1, 1)).toBe(false);
    expect(isUsablePitch(MAX_PITCH_HZ + 1, 1)).toBe(false);
  });

  it("rejects a non-finite frequency", () => {
    expect(isUsablePitch(Number.NaN, 1)).toBe(false);
  });
});

describe("frequencyToMidi", () => {
  it("places A4 at MIDI note 69", () => {
    expect(frequencyToMidi(A4_HZ)).toBeCloseTo(69, 6);
  });

  it("places A5 (double the frequency) exactly one octave up", () => {
    expect(frequencyToMidi(A4_HZ * 2)).toBeCloseTo(81, 6);
  });
});

describe("describePitch", () => {
  it("names A4 in tune at 440Hz", () => {
    const reading = describePitch(A4_HZ);
    expect(reading).not.toBeNull();
    expect(reading?.note).toBe("A4");
    expect(reading?.cents).toBe(0);
    expect(reading?.inTune).toBe(true);
  });

  it("reads a slightly sharp note as sharp but still in tune within tolerance", () => {
    // ~10 cents sharp of A4.
    const reading = describePitch(A4_HZ * 2 ** (10 / 1200));
    expect(reading?.note).toBe("A4");
    expect(reading?.cents).toBeGreaterThan(0);
    expect(reading?.inTune).toBe(true);
  });

  it("reads a note far enough off as out of tune", () => {
    const reading = describePitch(A4_HZ * 2 ** ((IN_TUNE_CENTS + 10) / 1200));
    expect(reading?.inTune).toBe(false);
  });

  it("wraps note names across an octave boundary (B to C)", () => {
    // One semitone above B4 is C5, not "B#4" or an out-of-range index.
    const b4 = A4_HZ * 2 ** (2 / 12);
    const c5 = A4_HZ * 2 ** (3 / 12);
    expect(describePitch(b4)?.note).toBe("B4");
    expect(describePitch(c5)?.note).toBe("C5");
  });

  it("returns null outside the sung range rather than inventing a note", () => {
    expect(describePitch(MIN_PITCH_HZ - 1)).toBeNull();
    expect(describePitch(MAX_PITCH_HZ + 1)).toBeNull();
    expect(describePitch(Number.NaN)).toBeNull();
  });
});

describe("formatPitch", () => {
  it("is empty for no reading", () => {
    expect(formatPitch(null)).toBe("");
  });

  it("signs a sharp reading with a leading +", () => {
    expect(formatPitch({ frequency: 441, note: "A4", cents: 4, inTune: true })).toBe("A4 +4");
  });

  it("does not double up the sign on a flat reading", () => {
    expect(formatPitch({ frequency: 439, note: "A4", cents: -4, inTune: true })).toBe("A4 -4");
  });
});

describe("rmsToDb", () => {
  it("maps full-scale RMS to 0dB", () => {
    expect(rmsToDb(1)).toBeCloseTo(0, 6);
  });

  it("floors silence and non-finite input at LEVEL_FLOOR_DB", () => {
    expect(rmsToDb(0)).toBe(LEVEL_FLOOR_DB);
    expect(rmsToDb(-1)).toBe(LEVEL_FLOOR_DB);
    expect(rmsToDb(Number.NaN)).toBe(LEVEL_FLOOR_DB);
  });

  it("never reports above 0dB even for an RMS over 1", () => {
    expect(rmsToDb(10)).toBe(0);
  });
});

describe("formatDb", () => {
  it("rounds to the nearest whole decibel", () => {
    expect(formatDb(CLIPPING_DB)).toBe("-3 dB");
  });

  it("reads the floor and anything below it as -inf", () => {
    expect(formatDb(LEVEL_FLOOR_DB)).toBe("-inf dB");
    expect(formatDb(LEVEL_FLOOR_DB - 5)).toBe("-inf dB");
  });
});
