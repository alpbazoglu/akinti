import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybackEndedEvent, PlaybackProgressEvent, PlaybackStore } from "@/lib/audio";

const reportPlaybackMock = vi.fn();
vi.mock("./actions", () => ({
  reportPlayback: (...args: unknown[]) => reportPlaybackMock(...args),
}));

vi.mock("./sessionId", () => ({
  getOrCreateSessionId: () => "test-session-id",
}));

const analyticsEvents: { name: string; waveId: string }[] = [];
vi.mock("./analyticsSink", () => ({
  emitAnalyticsEvent: (event: { name: string; waveId: string }) => {
    analyticsEvents.push(event);
  },
}));

// `vi.mock` calls above are hoisted above this import by Vitest, so
// `playTracker.ts`'s own imports of `./actions`/`./sessionId`/`./analyticsSink`
// resolve to the mocks.
const { __internal, playQualifyingMs } = await import("./playTracker");

type ProgressListener = (event: PlaybackProgressEvent) => void;
type EndedListener = (event: PlaybackEndedEvent) => void;

/** A minimal fake `PlaybackStore` — just enough surface for `attach()`. */
function createFakeStore() {
  const progressListeners: ProgressListener[] = [];
  const endedListeners: EndedListener[] = [];

  const onProgress = vi.fn((listener: ProgressListener) => {
    progressListeners.push(listener);
    return () => {
      const index = progressListeners.indexOf(listener);
      if (index !== -1) progressListeners.splice(index, 1);
    };
  });
  const onEnded = vi.fn((listener: EndedListener) => {
    endedListeners.push(listener);
    return () => {
      const index = endedListeners.indexOf(listener);
      if (index !== -1) endedListeners.splice(index, 1);
    };
  });

  return {
    store: { onProgress, onEnded } as unknown as PlaybackStore,
    onProgressSpy: onProgress,
    onEndedSpy: onEnded,
    emitProgress: (event: PlaybackProgressEvent) => {
      for (const listener of [...progressListeners]) listener(event);
    },
    emitEnded: (event: PlaybackEndedEvent) => {
      for (const listener of [...endedListeners]) listener(event);
    },
  };
}

function progressEvent(waveId: string, currentTime: number, duration: number): PlaybackProgressEvent {
  return { waveId, currentTime, duration, ratio: duration > 0 ? currentTime / duration : 0 };
}

/**
 * Emits realistic small `timeupdate`-style ticks from `fromSeconds` up to
 * `toSeconds` (each delta well under the tracker's 2s "continuous listening"
 * cap), the way real playback actually arrives — a single jump straight to a
 * large `currentTime` looks like a seek, not elapsed listening, and is
 * correctly ignored by the tracker (see the dedicated seek test below).
 * Callers resuming playback (e.g. after a pause) pass the previous call's
 * `toSeconds` back in as `fromSeconds` so listened time accumulates
 * correctly instead of restarting.
 */
function playThrough(
  emitProgress: (event: PlaybackProgressEvent) => void,
  waveId: string,
  fromSeconds: number,
  toSeconds: number,
  duration: number,
  step = 0.5,
): void {
  for (let t = fromSeconds + step; t < toSeconds; t += step) {
    emitProgress(progressEvent(waveId, t, duration));
  }
  emitProgress(progressEvent(waveId, toSeconds, duration));
}

beforeEach(() => {
  reportPlaybackMock.mockReset();
  reportPlaybackMock.mockResolvedValue({ ignored: false, countedPlay: false, countedReplay: false });
  analyticsEvents.length = 0;
});

describe("playQualifyingMs", () => {
  it("mirrors play_qualifying_ms(): max(1000, min(3000, 30% of duration))", () => {
    expect(playQualifyingMs(2000)).toBe(1000); // 30% = 600, clamped up to 1000
    expect(playQualifyingMs(5000)).toBe(1500); // 30% = 1500, within range
    expect(playQualifyingMs(20000)).toBe(3000); // 30% = 6000, clamped down to 3000
  });

  it("falls back to a 10s assumed duration when none is known, matching the SQL default", () => {
    expect(playQualifyingMs(null)).toBe(3000); // 30% of 10000 = 3000
    expect(playQualifyingMs(undefined)).toBe(3000);
    expect(playQualifyingMs(0)).toBe(3000);
  });
});

describe("playTracker (via __internal.attach)", () => {
  it("does not report anything before the qualifying threshold is crossed", () => {
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    // 10s clip; threshold is 3000ms. Only 1s reported so far.
    emitProgress(progressEvent("wave-1", 1, 10));

    expect(reportPlaybackMock).not.toHaveBeenCalled();
  });

  it("reports once the qualifying threshold is crossed, with completed: false", () => {
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-1", 0, 3.5, 10); // crosses the 3000ms threshold

    expect(reportPlaybackMock).toHaveBeenCalledTimes(1);
    expect(reportPlaybackMock).toHaveBeenCalledWith(
      expect.objectContaining({ waveId: "wave-1", completed: false, sessionId: "test-session-id" }),
    );
  });

  it("does not re-report on every subsequent tick once qualified", () => {
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-1", 0, 4, 10);
    playThrough(emitProgress, "wave-1", 4, 6, 10);

    expect(reportPlaybackMock).toHaveBeenCalledTimes(1);
  });

  it("fires wave_play_started only when the server reports counted_play", async () => {
    reportPlaybackMock.mockResolvedValue({ ignored: false, countedPlay: true, countedReplay: false });
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-1", 0, 4, 10);
    await flushMicrotasks();

    expect(analyticsEvents).toContainEqual(
      expect.objectContaining({ name: "wave_play_started", waveId: "wave-1" }),
    );
  });

  it("does not fire wave_play_started when the server does not count the play (e.g. debounced)", async () => {
    reportPlaybackMock.mockResolvedValue({ ignored: true, countedPlay: false, countedReplay: false });
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-1", 0, 4, 10);
    await flushMicrotasks();

    expect(analyticsEvents.some((e) => e.name === "wave_play_started")).toBe(false);
  });

  it("fires wave_play_completed once playback reaches 90% of duration", () => {
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-1", 0, 5, 10);
    expect(analyticsEvents.some((e) => e.name === "wave_play_completed")).toBe(false);

    playThrough(emitProgress, "wave-1", 5, 9.5, 10); // crosses 90% of 10s
    expect(analyticsEvents.filter((e) => e.name === "wave_play_completed")).toHaveLength(1);

    // Further ticks (and the eventual `ended`) must not double-fire it.
    playThrough(emitProgress, "wave-1", 9.5, 9.9, 10);
    expect(analyticsEvents.filter((e) => e.name === "wave_play_completed")).toHaveLength(1);
  });

  it("fires wave_play_completed on ended() even if 90% was never technically ticked", () => {
    const { store, emitProgress, emitEnded } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-2", 0, 1, 10);
    emitEnded({ waveId: "wave-2", duration: 10 });

    expect(analyticsEvents.filter((e) => e.name === "wave_play_completed")).toHaveLength(1);
  });

  it("fires wave_replayed only when the server reports counted_replay", async () => {
    reportPlaybackMock.mockResolvedValue({ ignored: false, countedPlay: false, countedReplay: true });
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-1", 0, 4, 10);
    await flushMicrotasks();

    expect(analyticsEvents).toContainEqual(
      expect.objectContaining({ name: "wave_replayed", waveId: "wave-1" }),
    );
  });

  it("ignores a large forward jump (a seek) as continuous listening", () => {
    const { store, emitProgress } = createFakeStore();
    __internal.attach(store);

    // A seek straight to 9s should not, by itself, count as 9s of listening.
    emitProgress(progressEvent("wave-3", 9, 10));

    expect(reportPlaybackMock).not.toHaveBeenCalled();
  });

  it("attaches to the same store only once, even if called repeatedly", () => {
    const { store, onProgressSpy } = createFakeStore();
    __internal.attach(store);
    __internal.attach(store);
    __internal.attach(store);

    expect(onProgressSpy).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh session for the same Wave after it ends and plays again", () => {
    const { store, emitProgress, emitEnded } = createFakeStore();
    __internal.attach(store);

    playThrough(emitProgress, "wave-4", 0, 4, 10);
    expect(reportPlaybackMock).toHaveBeenCalledTimes(1); // qualifying-threshold report

    // `ended` always reports a completion (the clip genuinely finished).
    emitEnded({ waveId: "wave-4", duration: 10 });
    expect(reportPlaybackMock).toHaveBeenCalledTimes(2);

    // A second, later listen crosses the qualifying threshold independently
    // — a stale "already qualified" flag from the first listen would
    // otherwise suppress this.
    playThrough(emitProgress, "wave-4", 0, 4, 10);
    expect(reportPlaybackMock).toHaveBeenCalledTimes(3);
    expect(reportPlaybackMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ waveId: "wave-4", completed: false }),
    );
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
