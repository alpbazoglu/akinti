import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AudioRecorder,
  type AudioRecorderOptions,
  type RecorderMediaRecorderLike,
  type RecorderMediaStreamLike,
} from "./recorder";

class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

class FakeStream implements RecorderMediaStreamLike {
  readonly tracks = [new FakeTrack(), new FakeTrack()];
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeMediaRecorder implements RecorderMediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  start(): void {
    this.state = "recording";
  }

  pause(): void {
    this.state = "paused";
  }

  resume(): void {
    this.state = "recording";
  }

  stop(): void {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["chunk"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

function denyWith(name: string): () => Promise<RecorderMediaStreamLike> {
  return () => {
    const error = new Error("denied");
    (error as { name?: string }).name = name;
    return Promise.reject(error);
  };
}

function makeRecorder(overrides: Partial<AudioRecorderOptions> = {}): {
  recorder: AudioRecorder;
  recorders: FakeMediaRecorder[];
} {
  const recorders: FakeMediaRecorder[] = [];
  const recorder = new AudioRecorder({
    requestMicrophone: async () => new FakeStream(),
    createRecorder: () => {
      const instance = new FakeMediaRecorder();
      recorders.push(instance);
      return instance;
    },
    createAudioContext: () => null,
    maxDurationMs: 5000,
    tickIntervalMs: 100,
    ...overrides,
  });
  return { recorder, recorders };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AudioRecorder state machine", () => {
  it("starts idle", () => {
    const { recorder } = makeRecorder();
    expect(recorder.getState().status).toBe("idle");
    expect(recorder.getState().result).toBeNull();
  });

  it("goes requesting -> recording on a successful start", async () => {
    const { recorder } = makeRecorder();
    const promise = recorder.start();
    expect(recorder.getState().status).toBe("requesting");
    await promise;
    expect(recorder.getState().status).toBe("recording");
    expect(recorder.getState().elapsedMs).toBe(0);
  });

  it("enters denied on a NotAllowedError from getUserMedia", async () => {
    const { recorder } = makeRecorder({ requestMicrophone: denyWith("NotAllowedError") });
    await recorder.start();
    expect(recorder.getState().status).toBe("denied");
    expect(recorder.getState().error).toMatch(/denied/i);
  });

  it("enters unsupported on a NotFoundError (no microphone)", async () => {
    const { recorder } = makeRecorder({ requestMicrophone: denyWith("NotFoundError") });
    await recorder.start();
    expect(recorder.getState().status).toBe("unsupported");
  });

  it("enters a generic error state on an unrecognised getUserMedia failure", async () => {
    const { recorder } = makeRecorder({ requestMicrophone: denyWith("AbortError") });
    await recorder.start();
    expect(recorder.getState().status).toBe("error");
  });

  it("advances elapsed time and level while recording", async () => {
    const { recorder } = makeRecorder();
    await recorder.start();

    await vi.advanceTimersByTimeAsync(300);
    expect(recorder.getState().elapsedMs).toBeGreaterThanOrEqual(300);
    expect(recorder.getState().status).toBe("recording");
  });

  it("pauses and stops advancing elapsed time, then resumes", async () => {
    const { recorder } = makeRecorder();
    await recorder.start();
    await vi.advanceTimersByTimeAsync(300);

    recorder.pause();
    expect(recorder.getState().status).toBe("paused");
    const pausedElapsed = recorder.getState().elapsedMs;

    await vi.advanceTimersByTimeAsync(1000);
    expect(recorder.getState().elapsedMs).toBe(pausedElapsed);

    recorder.resume();
    expect(recorder.getState().status).toBe("recording");
    await vi.advanceTimersByTimeAsync(200);
    expect(recorder.getState().elapsedMs).toBeGreaterThan(pausedElapsed);
  });

  it("stop() produces a result with a blob, mimeType and durationMs", async () => {
    const { recorder } = makeRecorder({ mimeType: "audio/webm;codecs=opus" });
    await recorder.start();
    await vi.advanceTimersByTimeAsync(500);

    recorder.stop();

    const state = recorder.getState();
    expect(state.status).toBe("stopped");
    expect(state.result).not.toBeNull();
    expect(state.result?.mimeType).toBe("audio/webm;codecs=opus");
    expect(state.result?.blob).toBeInstanceOf(Blob);
    expect(state.result?.durationMs).toBeGreaterThanOrEqual(500);
  });

  it("releases every media track once stopped", async () => {
    let capturedStream: FakeStream | null = null;
    const { recorder } = makeRecorder({
      requestMicrophone: async () => {
        capturedStream = new FakeStream();
        return capturedStream;
      },
    });
    await recorder.start();
    recorder.stop();

    expect(capturedStream).not.toBeNull();
    for (const track of capturedStream!.getTracks()) {
      expect(track.stopped).toBe(true);
    }
  });

  it("auto-stops and flags autoStopped once the max duration is reached", async () => {
    const { recorder } = makeRecorder({ maxDurationMs: 1000, tickIntervalMs: 100 });
    await recorder.start();

    await vi.advanceTimersByTimeAsync(1200);

    const state = recorder.getState();
    expect(state.status).toBe("stopped");
    expect(state.autoStopped).toBe(true);
    expect(state.result?.durationMs).toBeLessThanOrEqual(1000);
  });

  it("discard()/retake() returns to idle and clears the result", async () => {
    const { recorder } = makeRecorder();
    await recorder.start();
    recorder.stop();
    expect(recorder.getState().status).toBe("stopped");

    recorder.retake();

    const state = recorder.getState();
    expect(state.status).toBe("idle");
    expect(state.result).toBeNull();
    expect(state.elapsedMs).toBe(0);
  });

  it("can record again after a retake", async () => {
    const { recorder, recorders } = makeRecorder();
    await recorder.start();
    recorder.stop();
    recorder.retake();

    await recorder.start();
    expect(recorder.getState().status).toBe("recording");
    expect(recorders).toHaveLength(2);
  });

  it("notifies subscribers on every state change", async () => {
    const { recorder } = makeRecorder();
    const listener = vi.fn();
    const unsubscribe = recorder.subscribe(listener);

    await recorder.start();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    const callsAfterUnsubscribe = listener.mock.calls.length;
    recorder.stop();
    expect(listener.mock.calls.length).toBe(callsAfterUnsubscribe);
  });

  it("destroy() stops an in-flight recording and releases tracks", async () => {
    let capturedStream: FakeStream | null = null;
    const { recorder } = makeRecorder({
      requestMicrophone: async () => {
        capturedStream = new FakeStream();
        return capturedStream;
      },
    });
    await recorder.start();

    recorder.destroy();

    expect(capturedStream).not.toBeNull();
    for (const track of capturedStream!.getTracks()) {
      expect(track.stopped).toBe(true);
    }
  });
});
