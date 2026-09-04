"use client";

/**
 * In-app audio recording (spec section 17).
 *
 * `AudioRecorder` is a small external store — the same shape as
 * `PlaybackStore` in `playbackStore.ts` — wrapping `MediaRecorder` plus an
 * `AnalyserNode` level meter. `useRecorder()` is the React binding. Kept
 * outside React so the state machine, timers and media handles can be unit
 * tested without mounting a component (see `recorder.test.ts`).
 *
 * This module never uploads or publishes anything — it only produces a local
 * `{ blob, mimeType, durationMs }` result for the caller to hand to the
 * upload step once that is wired up server-side.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { MAX_AUDIO_DURATION_MS } from "@/lib/supabase/config";

import { getRecordingMimeType, isRecordingSupported } from "./capabilities";

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "denied"
  | "unsupported"
  | "recording"
  | "paused"
  | "stopped"
  | "error";

export interface RecorderResult {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
}

export interface RecorderState {
  readonly status: RecorderStatus;
  /** Milliseconds of actual recorded audio (pauses excluded). */
  readonly elapsedMs: number;
  /** Live input level, `0..1`, updated while recording. */
  readonly level: number;
  /** Human-readable message for the current `denied`/`unsupported`/`error` state. */
  readonly error: string | null;
  /** True once the recorder auto-stopped because it hit `maxDurationMs`. */
  readonly autoStopped: boolean;
  readonly result: RecorderResult | null;
  readonly maxDurationMs: number;
}

export type RecorderUnsubscribe = () => void;

/* ------------------------------------------------------------------------ */
/* Injectable seams (mirrors PlaybackStore's `createAudio` pattern)         */
/* ------------------------------------------------------------------------ */

/** The subset of `MediaStreamTrack` this module touches. */
export interface RecorderMediaStreamTrackLike {
  stop(): void;
}

/** The subset of `MediaStream` this module touches. */
export interface RecorderMediaStreamLike {
  getTracks(): RecorderMediaStreamTrackLike[];
}

/** The subset of `MediaRecorder` this module touches. */
export interface RecorderMediaRecorderLike {
  state: "inactive" | "recording" | "paused";
  start(timesliceMs?: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** The subset of `AnalyserNode` this module touches. */
export interface RecorderAnalyserLike {
  fftSize: number;
  getByteTimeDomainData(array: Uint8Array): void;
}

/** The subset of `AudioContext` this module touches. */
export interface RecorderAudioContextLike {
  readonly state: string;
  createMediaStreamSource(stream: RecorderMediaStreamLike): { connect(node: unknown): void };
  createAnalyser(): RecorderAnalyserLike;
  close(): Promise<void> | void;
}

export interface AudioRecorderOptions {
  /** Auto-stop threshold. Defaults to `MAX_AUDIO_DURATION_MS` (spec §17/§18/§34). */
  maxDurationMs?: number;
  /** Force a mime type instead of auto-detecting via `getRecordingMimeType()`. */
  mimeType?: string | null;
  /** How often elapsed time and the level meter refresh, in ms. */
  tickIntervalMs?: number;
  /** `MediaRecorder.start(timeslice)` — how often `ondataavailable` fires. */
  timesliceMs?: number;
  now?: () => number;
  requestMicrophone?: () => Promise<RecorderMediaStreamLike>;
  createRecorder?: (
    stream: RecorderMediaStreamLike,
    mimeType: string | null,
  ) => RecorderMediaRecorderLike;
  createAudioContext?: () => RecorderAudioContextLike | null;
  setIntervalFn?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
}

const INITIAL_STATE: Omit<RecorderState, "maxDurationMs"> = {
  status: "idle",
  elapsedMs: 0,
  level: 0,
  error: null,
  autoStopped: false,
  result: null,
};

function defaultRequestMicrophone(): Promise<RecorderMediaStreamLike> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function defaultCreateRecorder(
  stream: RecorderMediaStreamLike,
  mimeType: string | null,
): RecorderMediaRecorderLike {
  const options = mimeType ? { mimeType } : undefined;
  return new MediaRecorder(
    stream as unknown as MediaStream,
    options,
  ) as unknown as RecorderMediaRecorderLike;
}

function defaultCreateAudioContext(): RecorderAudioContextLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor() as unknown as RecorderAudioContextLike;
}

/** Denial-shaped `getUserMedia` error names across engines. */
const PERMISSION_DENIED_ERROR_NAMES = new Set([
  "NotAllowedError",
  "PermissionDeniedError",
  "SecurityError",
]);

/** "No microphone present" error names across engines. */
const NO_DEVICE_ERROR_NAMES = new Set(["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"]);

export class AudioRecorder {
  private state: RecorderState;
  /**
   * Computed once and never mutated — `getServerState` must return the exact
   * same reference on every call. `useSyncExternalStore` (`useRecorder`
   * below) calls `getServerSnapshot` on every render to detect a hydration
   * mismatch; a fresh object literal each time looks like "always changed"
   * and React logs "The result of getServerSnapshot should be cached to
   * avoid an infinite loop" (and can genuinely loop). This value is
   * immutable and derived only from constructor options, so computing it
   * once is always correct.
   */
  private readonly serverState: RecorderState;
  private readonly listeners = new Set<() => void>();
  private readonly opts: {
    maxDurationMs: number;
    mimeType: string | null | undefined;
    tickIntervalMs: number;
    timesliceMs: number;
    now: () => number;
    requestMicrophone: () => Promise<RecorderMediaStreamLike>;
    createRecorder: (
      stream: RecorderMediaStreamLike,
      mimeType: string | null,
    ) => RecorderMediaRecorderLike;
    createAudioContext: () => RecorderAudioContextLike | null;
    setIntervalFn: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
    clearIntervalFn: (id: ReturnType<typeof setInterval>) => void;
  };

  private stream: RecorderMediaStreamLike | null = null;
  private mediaRecorder: RecorderMediaRecorderLike | null = null;
  private audioContext: RecorderAudioContextLike | null = null;
  private analyser: RecorderAnalyserLike | null = null;
  private chunks: Blob[] = [];
  private chosenMimeType: string | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private pausedAccumMs = 0;
  private pauseStartedAt: number | null = null;
  /**
   * True only when both media seams use the real browser defaults. Gates the
   * up-front `isRecordingSupported()` check so it reflects actual browser
   * capability — tests (and any future caller) that inject their own
   * `requestMicrophone`/`createRecorder` bypass it and talk to their doubles
   * directly, the same way `PlaybackStore.ensureAudio()` only special-cases
   * its default `createAudio`.
   */
  private readonly usesRealBrowserApis: boolean;

  constructor(options: AudioRecorderOptions = {}) {
    this.usesRealBrowserApis =
      options.requestMicrophone === undefined && options.createRecorder === undefined;
    this.opts = {
      maxDurationMs: options.maxDurationMs ?? MAX_AUDIO_DURATION_MS,
      mimeType: options.mimeType,
      tickIntervalMs: options.tickIntervalMs ?? 100,
      timesliceMs: options.timesliceMs ?? 1000,
      now: options.now ?? (() => Date.now()),
      requestMicrophone: options.requestMicrophone ?? defaultRequestMicrophone,
      createRecorder: options.createRecorder ?? defaultCreateRecorder,
      createAudioContext: options.createAudioContext ?? defaultCreateAudioContext,
      setIntervalFn: options.setIntervalFn ?? ((handler, ms) => setInterval(handler, ms)),
      clearIntervalFn: options.clearIntervalFn ?? ((id) => clearInterval(id)),
    };
    this.state = { ...INITIAL_STATE, maxDurationMs: this.opts.maxDurationMs };
    this.serverState = { ...INITIAL_STATE, maxDurationMs: this.opts.maxDurationMs };
  }

  /* ---------------------------------------------------------------- */
  /* Subscription surface (useSyncExternalStore)                      */
  /* ---------------------------------------------------------------- */

  readonly subscribe = (listener: () => void): RecorderUnsubscribe => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): RecorderState => this.state;

  readonly getServerState = (): RecorderState => this.serverState;

  /* ---------------------------------------------------------------- */
  /* Commands                                                          */
  /* ---------------------------------------------------------------- */

  async start(): Promise<void> {
    if (this.state.status === "recording" || this.state.status === "requesting") return;

    if (this.usesRealBrowserApis && !isRecordingSupported()) {
      this.setState({
        status: "unsupported",
        error: "Recording is not supported in this browser.",
      });
      return;
    }

    this.setState({ ...INITIAL_STATE, maxDurationMs: this.opts.maxDurationMs, status: "requesting" });

    let stream: RecorderMediaStreamLike;
    try {
      stream = await this.opts.requestMicrophone();
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      if (name && PERMISSION_DENIED_ERROR_NAMES.has(name)) {
        this.setState({
          status: "denied",
          error: "Microphone access was denied. Allow microphone access to record.",
        });
      } else if (name && NO_DEVICE_ERROR_NAMES.has(name)) {
        this.setState({
          status: "unsupported",
          error: "No microphone was found on this device.",
        });
      } else {
        this.setState({
          status: "error",
          error: "Could not access the microphone. Please try again.",
        });
      }
      return;
    }

    // The caller may have discarded/unmounted while permission was pending.
    // Routed through a method (rather than `this.state.status` directly) so
    // TypeScript doesn't carry forward this function's earlier narrowing —
    // `setState` genuinely can have changed the status by now.
    if (this.currentStatus() !== "requesting") {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const mimeType = this.opts.mimeType !== undefined ? this.opts.mimeType : getRecordingMimeType();

    let recorder: RecorderMediaRecorderLike;
    try {
      recorder = this.opts.createRecorder(stream, mimeType);
    } catch {
      for (const track of stream.getTracks()) track.stop();
      this.setState({
        status: "unsupported",
        error: "Recording is not supported in this browser.",
      });
      return;
    }

    this.stream = stream;
    this.mediaRecorder = recorder;
    this.chosenMimeType = mimeType;
    this.chunks = [];
    this.pausedAccumMs = 0;
    this.pauseStartedAt = null;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onerror = () => {
      this.setState({ status: "error", error: "Recording failed unexpectedly." });
      this.cleanupAll();
    };
    recorder.onstop = () => {
      this.finishRecording();
    };

    this.setupLevelMeter(stream);

    this.startedAt = this.opts.now();
    recorder.start(this.opts.timesliceMs);
    this.setState({ status: "recording", elapsedMs: 0, level: 0, error: null, result: null });
    this.startTicking();
  }

  pause(): void {
    if (this.state.status !== "recording" || !this.mediaRecorder) return;
    this.mediaRecorder.pause();
    this.pauseStartedAt = this.opts.now();
    this.stopTicking();
    this.setState({ status: "paused", level: 0 });
  }

  resume(): void {
    if (this.state.status !== "paused" || !this.mediaRecorder) return;
    if (this.pauseStartedAt !== null) {
      this.pausedAccumMs += this.opts.now() - this.pauseStartedAt;
      this.pauseStartedAt = null;
    }
    this.mediaRecorder.resume();
    this.setState({ status: "recording" });
    this.startTicking();
  }

  stop(): void {
    if (this.state.status !== "recording" && this.state.status !== "paused") return;
    this.stopTicking();
    this.mediaRecorder?.stop();
  }

  /** Discard the current/finished take and return to `idle` so the user can record again. */
  discard(): void {
    this.cleanupAll();
    this.setState({ ...INITIAL_STATE, maxDurationMs: this.opts.maxDurationMs });
  }

  /** Alias for `discard()` — same operation, named for the "retake" UI action. */
  retake(): void {
    this.discard();
  }

  /** Detach everything. Call from a component's unmount cleanup. */
  destroy(): void {
    this.cleanupAll();
    this.listeners.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private currentStatus(): RecorderStatus {
    return this.state.status;
  }

  private setupLevelMeter(stream: RecorderMediaStreamLike): void {
    try {
      const audioContext = this.opts.createAudioContext();
      if (!audioContext) return;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      // Deliberately never connected to a destination — this graph exists
      // only to read levels, never to play the mic back (no feedback).
      source.connect(analyser);
      this.audioContext = audioContext;
      this.analyser = analyser;
    } catch {
      // The level meter is a nice-to-have; recording still works without it.
      this.audioContext = null;
      this.analyser = null;
    }
  }

  private readLevel(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i += 1) {
      const normalised = (data[i] - 128) / 128;
      sumSquares += normalised * normalised;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    return Math.min(1, rms * 3.2);
  }

  private computeElapsedMs(): number {
    const activePauseMs = this.pauseStartedAt !== null ? this.opts.now() - this.pauseStartedAt : 0;
    return Math.max(0, this.opts.now() - this.startedAt - this.pausedAccumMs - activePauseMs);
  }

  private startTicking(): void {
    this.stopTicking();
    this.tickTimer = this.opts.setIntervalFn(() => this.tick(), this.opts.tickIntervalMs);
  }

  private stopTicking(): void {
    if (this.tickTimer !== null) {
      this.opts.clearIntervalFn(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick(): void {
    if (this.state.status !== "recording") return;
    const elapsedMs = this.computeElapsedMs();
    const level = this.readLevel();

    if (elapsedMs >= this.opts.maxDurationMs) {
      this.setState({ elapsedMs: this.opts.maxDurationMs, level, autoStopped: true });
      this.stop();
      return;
    }

    this.setState({ elapsedMs, level });
  }

  private finishRecording(): void {
    const mimeType = this.chosenMimeType ?? this.chunks[0]?.type ?? "audio/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    const durationMs = Math.round(this.computeElapsedMs());
    this.releaseMedia();
    this.setState({
      status: "stopped",
      level: 0,
      elapsedMs: durationMs,
      result: { blob, mimeType, durationMs },
    });
  }

  private releaseMedia(): void {
    this.stopTicking();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.mediaRecorder) {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.onerror = null;
      this.mediaRecorder = null;
    }
    this.analyser = null;
    if (this.audioContext) {
      void Promise.resolve(this.audioContext.close()).catch(() => {});
      this.audioContext = null;
    }
  }

  private cleanupAll(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // already stopping/stopped
      }
    }
    this.releaseMedia();
  }

  private setState(patch: Partial<RecorderState>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof RecorderState)[]) {
      if (this.state[key] !== patch[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

/* ------------------------------------------------------------------------ */
/* React binding                                                            */
/* ------------------------------------------------------------------------ */

export interface UseRecorderResult {
  readonly state: RecorderState;
  readonly start: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
  readonly discard: () => void;
  readonly retake: () => void;
}

/**
 * React binding for `AudioRecorder`. Creates one recorder per mount and
 * releases the microphone/AudioContext on unmount — recording must never
 * leave a hot mic behind when the user navigates away.
 */
export function useRecorder(options?: AudioRecorderOptions): UseRecorderResult {
  const [recorder] = useState(() => new AudioRecorder(options));

  useEffect(() => {
    return () => {
      recorder.destroy();
    };
  }, [recorder]);

  const state = useSyncExternalStore(recorder.subscribe, recorder.getState, recorder.getServerState);

  const start = useCallback(() => {
    void recorder.start();
  }, [recorder]);
  const pause = useCallback(() => recorder.pause(), [recorder]);
  const resume = useCallback(() => recorder.resume(), [recorder]);
  const stop = useCallback(() => recorder.stop(), [recorder]);
  const discard = useCallback(() => recorder.discard(), [recorder]);
  const retake = useCallback(() => recorder.retake(), [recorder]);

  return { state, start, pause, resume, stop, discard, retake };
}
