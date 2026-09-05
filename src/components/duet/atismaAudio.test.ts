import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { concatenateAtismaTurns, type AtismaTurnTake } from "./atismaAudio";

/**
 * jsdom has no Web Audio, so `AudioContext`/`OfflineAudioContext` are faked
 * here. Each take's blob is a single byte identifying which fixture decoded
 * duration/sample rate it should resolve to — this is what lets a test
 * assert `concatenateAtismaTurns` builds its ranges from the *decoded*
 * duration rather than the recorder-reported one passed alongside it
 * (review2 #7), without a real decoder.
 */
interface Fixture {
  readonly sampleRate: number;
  readonly durationSeconds: number;
}

function makeTake(fixtureIndex: number, reportedDurationMs: number): AtismaTurnTake {
  return {
    blob: new Blob([Uint8Array.from([fixtureIndex])]),
    durationMs: reportedDurationMs,
  };
}

let decodeCallCount = 0;
let closeCallCount = 0;
let fixtures: Fixture[] = [];

class FakeAudioBuffer {
  readonly length: number;
  readonly numberOfChannels = 1;
  constructor(
    public readonly sampleRate: number,
    public readonly duration: number,
  ) {
    this.length = Math.round(duration * sampleRate);
  }
  getChannelData(): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeAudioContext {
  constructor() {
    decodeCallCount += 1;
  }
  async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<FakeAudioBuffer> {
    const index = new Uint8Array(arrayBuffer)[0] ?? 0;
    const fixture = fixtures[index];
    if (!fixture) throw new Error(`no fixture for index ${index}`);
    return new FakeAudioBuffer(fixture.sampleRate, fixture.durationSeconds);
  }
  async close(): Promise<void> {
    closeCallCount += 1;
  }
}

class FakeOfflineAudioContext {
  public readonly destination = {};
  public renderedFrames: number | null = null;
  private readonly sources: { buffer: FakeAudioBuffer | null; startedAt: number | null }[] = [];

  constructor(
    public readonly channels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {}

  createBufferSource() {
    const node: {
      buffer: FakeAudioBuffer | null;
      connect: () => void;
      start: (when: number) => void;
    } = {
      buffer: null,
      connect: () => {},
      start: (when: number) => {
        this.sources.push({ buffer: node.buffer, startedAt: when });
      },
    };
    return node;
  }

  async startRendering(): Promise<FakeAudioBuffer> {
    this.renderedFrames = this.length;
    return new FakeAudioBuffer(this.sampleRate, this.length / this.sampleRate);
  }
}

beforeEach(() => {
  decodeCallCount = 0;
  closeCallCount = 0;
  fixtures = [];
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("concatenateAtismaTurns", () => {
  it("throws when there are no turns", async () => {
    await expect(concatenateAtismaTurns([])).rejects.toThrow("No turns were recorded.");
  });

  it("decodes every take through exactly one shared AudioContext, then closes it", async () => {
    fixtures = [
      { sampleRate: 48_000, durationSeconds: 1 },
      { sampleRate: 48_000, durationSeconds: 1 },
      { sampleRate: 48_000, durationSeconds: 1 },
    ];
    const takes = fixtures.map((_, i) => makeTake(i, 1000));

    await concatenateAtismaTurns(takes);

    // Not one AudioContext per take (up to MAX_TURNS=8 concurrently, review2
    // #6) — exactly one, reused for every decode.
    expect(decodeCallCount).toBe(1);
    expect(closeCallCount).toBe(1);
  });

  it("builds ranges from each take's decoded duration, not the recorder-reported durationMs", async () => {
    // Reported durations claim 1000ms each; the decoder disagrees.
    fixtures = [
      { sampleRate: 48_000, durationSeconds: 0.8 }, // decodes to 800ms, not the reported 1000ms
      { sampleRate: 48_000, durationSeconds: 1.5 }, // decodes to 1500ms, not the reported 1000ms
    ];
    const takes = [makeTake(0, 1000), makeTake(1, 1000)];

    const result = await concatenateAtismaTurns(takes);

    expect(result.ranges).toEqual([
      { startMs: 0, endMs: 800 },
      { startMs: 800, endMs: 2300 },
    ]);
    expect(result.durationMs).toBe(2300);
  });

  it("renders a total frame count matching the summed decoded durations, not the reported ones", async () => {
    fixtures = [
      { sampleRate: 48_000, durationSeconds: 0.5 },
      { sampleRate: 48_000, durationSeconds: 0.25 },
    ];
    // Reported durations are wildly different from the decoded ones.
    const takes = [makeTake(0, 5000), makeTake(1, 5000)];

    const result = await concatenateAtismaTurns(takes);

    // 0.75s total at 48kHz.
    expect(result.durationMs).toBe(750);
  });

  it("produces a playable WAV blob", async () => {
    fixtures = [{ sampleRate: 48_000, durationSeconds: 0.2 }];
    const result = await concatenateAtismaTurns([makeTake(0, 200)]);
    expect(result.blob.type).toBe("audio/wav");
    expect(result.blob.size).toBeGreaterThan(44); // header plus at least some data
  });
});
