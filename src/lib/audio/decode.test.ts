import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeToPeaks, getDurationMs } from "./decode";

/** A fake `AudioBuffer` with a synthetic single-channel waveform. */
function makeFakeAudioBuffer(samples: number[], sampleRate = 8000) {
  const data = new Float32Array(samples);
  return {
    duration: data.length / sampleRate,
    getChannelData: () => data,
  };
}

class FakeAudioContext {
  closed = false;
  constructor(private readonly buffer: ReturnType<typeof makeFakeAudioBuffer>) {}
  decodeAudioData(): Promise<ReturnType<typeof makeFakeAudioBuffer>> {
    return Promise.resolve(this.buffer);
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

function stubAudioContext(buffer: ReturnType<typeof makeFakeAudioBuffer>): void {
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return new FakeAudioContext(buffer);
      }
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDurationMs", () => {
  it("returns the decoded duration rounded to whole milliseconds", async () => {
    stubAudioContext(makeFakeAudioBuffer(new Array(4000).fill(0), 8000));
    const durationMs = await getDurationMs(new Blob(["fake"], { type: "audio/wav" }));
    expect(durationMs).toBe(500);
  });

  it("throws a clear error when the Web Audio API is unavailable", async () => {
    vi.stubGlobal("AudioContext", undefined);
    await expect(getDurationMs(new Blob(["fake"]))).rejects.toThrow(/Web Audio API/);
  });
});

describe("decodeToPeaks", () => {
  it("buckets samples into normalised 0..1 peaks", async () => {
    // Four buckets of four samples each; each bucket's peak is its loudest sample.
    const samples = [
      0.1, -0.2, 0.05, 0.0, // bucket 0 -> peak 0.2
      0.9, -0.1, 0.2, 0.0, // bucket 1 -> peak 0.9
      0.0, 0.0, 0.0, 0.0, // bucket 2 -> peak 0
      -0.5, 0.3, 0.1, 0.0, // bucket 3 -> peak 0.5
    ];
    stubAudioContext(makeFakeAudioBuffer(samples));

    const peaks = await decodeToPeaks(new Blob(["fake"], { type: "audio/wav" }), 4);

    expect(peaks).toHaveLength(4);
    expect(peaks[0]).toBeCloseTo(0.2, 5);
    expect(peaks[1]).toBeCloseTo(0.9, 5);
    expect(peaks[2]).toBe(0);
    expect(peaks[3]).toBeCloseTo(0.5, 5);
    for (const peak of peaks) {
      expect(peak).toBeGreaterThanOrEqual(0);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });

  it("returns an empty array when asked for zero buckets", async () => {
    stubAudioContext(makeFakeAudioBuffer([0, 0, 0, 0]));
    expect(await decodeToPeaks(new Blob(["fake"]), 0)).toEqual([]);
  });
});
