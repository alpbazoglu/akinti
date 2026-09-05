"use client";

/**
 * The live monitor: everything a singer needs to see and hear *while* the
 * take is running, hung off the same `MediaStream` the recorder is writing.
 *
 * Three jobs, one `AudioContext`:
 *
 * 1. **Level.** RMS of the time-domain data, read at frame rate by whoever is
 *    drawing, converted to dBFS by `./pitch.ts`. The trace is drawn from RMS
 *    rather than peak so it moves smoothly (`docs/design/DESIGN.md` §6.2).
 * 2. **Pitch.** `pitchy`'s McLeod detector over the same buffer, gated on its
 *    own clarity so the meter goes quiet during a breath instead of jittering
 *    through nonsense notes.
 * 3. **Monitoring.** Optionally routing the input to the output so the singer
 *    hears themselves, with the round-trip latency reported honestly rather
 *    than hidden, and with the RNNoise worklet inserted when they say they
 *    are in a noisy room — **on the monitor path only**. The recorded stream
 *    is never touched: baking a denoiser into the take is a decision the user
 *    cannot undo, and the server pipeline does that job better
 *    (`docs/AUDIO_ARCHITECTURE.md`).
 *
 * Monitoring defaults to off, because `mobile-guidelines.md` rule 19 is
 * explicit: never play live input through speakers. It is offered only after
 * the headphones hint, and the screen says what the latency actually is.
 *
 * Kept outside React, like `PlaybackStore` and `AudioRecorder`, so the graph
 * lifecycle is testable and so a redraw never rebuilds an audio graph.
 */

import {
  MONITOR_SAMPLE_RATE,
  RNNOISE_WASM_SIMD_URL,
  RNNOISE_WASM_URL,
  RNNOISE_WORKLET_URL,
} from "./constraints";
import {
  CLIPPING_DB,
  describePitch,
  isUsablePitch,
  rmsToDb,
  type PitchReading,
} from "./pitch";

/** 2048 samples at 48 kHz is ~43ms: long enough for the lowest sung note. */
const ANALYSER_FFT_SIZE = 2048;

export interface MonitorSample {
  /** Linear RMS, `0..1`. */
  readonly rms: number;
  /** The same level in dBFS, floored at `LEVEL_FLOOR_DB`. */
  readonly db: number;
  /** Within 3 dB of full scale — the point SCREENS.md turns the readout Signal. */
  readonly clipping: boolean;
  /** `null` whenever the detector is not confident. */
  readonly pitch: PitchReading | null;
}

const SILENT_SAMPLE: MonitorSample = { rms: 0, db: rmsToDb(0), clipping: false, pitch: null };

export interface LiveMonitorOptions {
  /** Overridden in tests; the default builds a real `AudioContext`. */
  readonly createContext?: () => AudioContext | null;
}

function defaultCreateContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    // RNNoise assumes 48 kHz. Asking for it costs nothing when the hardware
    // already runs there and makes the worklet correct when it does not.
    return new Ctor({ sampleRate: MONITOR_SAMPLE_RATE });
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}

export class LiveMonitor {
  private readonly createContext: () => AudioContext | null;

  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private monitorGain: GainNode | null = null;
  private suppressor: AudioNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private detector: { findPitch(input: Float32Array, sampleRate: number): [number, number] } | null =
    null;

  private monitoring = false;
  private suppressing = false;
  /** Bumps on every attach, so a slow worklet load cannot wire into a dead graph. */
  private generation = 0;

  constructor(options: LiveMonitorOptions = {}) {
    this.createContext = options.createContext ?? defaultCreateContext;
  }

  /**
   * Bind to a capture stream. Safe to call with the same stream twice; safe
   * to call with `null` to tear down. Resolves once the analyser is live —
   * the pitch detector and the suppressor load in the background and the
   * meter simply reports less until they arrive.
   */
  async attach(stream: MediaStream | null): Promise<void> {
    this.detach();
    if (!stream) return;

    const context = this.createContext();
    if (!context) return;

    const generation = (this.generation += 1);
    this.context = context;

    try {
      // Autoplay policy: a context created outside a gesture starts suspended
      // (`mobile-guidelines.md` rule 24). `start()` on the recorder is always
      // inside a gesture, which is where this runs.
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      analyser.smoothingTimeConstant = 0;

      const monitorGain = context.createGain();
      // Silent until the singer asks for monitoring. The node exists from the
      // start so turning monitoring on is a gain change, not a graph rebuild.
      monitorGain.gain.value = 0;
      monitorGain.connect(context.destination);

      source.connect(analyser);
      source.connect(monitorGain);

      if (generation !== this.generation) {
        void context.close().catch(() => {});
        return;
      }

      this.source = source;
      this.analyser = analyser;
      this.monitorGain = monitorGain;
      this.buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));

      void this.loadDetector(analyser.fftSize, generation);
      if (this.suppressing) void this.enableSuppressor(generation);
      if (this.monitoring) monitorGain.gain.value = 1;
    } catch {
      // A monitor is an aid, never a precondition for recording: if the graph
      // will not build, the take still runs with no meter.
      this.detach();
    }
  }

  /** Release the graph and close the context. Idempotent. */
  detach(): void {
    this.generation += 1;
    const context = this.context;
    this.context = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.monitorGain?.disconnect();
    this.destroySuppressor();
    this.source = null;
    this.analyser = null;
    this.monitorGain = null;
    this.buffer = null;
    this.detector = null;
    if (context) void Promise.resolve(context.close()).catch(() => {});
  }

  /** True once there is a graph to read. */
  get isActive(): boolean {
    return this.analyser !== null;
  }

  /**
   * Round-trip monitoring latency in milliseconds, or `null` when the engine
   * will not say. Reported rather than estimated: `mobile-guidelines.md` §2
   * notes that anything above ~10ms is audible to a singer, so guessing here
   * would be worse than admitting we do not know.
   */
  get latencyMs(): number | null {
    const context = this.context;
    if (!context) return null;
    const base = context.baseLatency ?? 0;
    const output = context.outputLatency ?? 0;
    const total = base + output;
    if (!Number.isFinite(total) || total <= 0) return null;
    return Math.round(total * 1000);
  }

  /** Hear yourself. Off by default (rule 19: never through speakers). */
  setMonitoring(on: boolean): void {
    this.monitoring = on;
    if (this.monitorGain) this.monitorGain.gain.value = on ? 1 : 0;
  }

  get isMonitoring(): boolean {
    return this.monitoring;
  }

  /**
   * Insert or remove RNNoise on the monitor path. Never affects the recorded
   * stream. Resolves once the worklet is running, or immediately when it
   * cannot be loaded, in which case monitoring simply stays unprocessed.
   */
  async setNoiseSuppression(on: boolean): Promise<void> {
    this.suppressing = on;
    if (!on) {
      this.destroySuppressor();
      this.rewireMonitorPath();
      return;
    }
    await this.enableSuppressor(this.generation);
  }

  get isSuppressing(): boolean {
    return this.suppressing && this.suppressor !== null;
  }

  /**
   * Read the current level and pitch. Called from a `requestAnimationFrame`
   * loop that only runs while recording (§6.4), never on a timer of its own.
   */
  sample(): MonitorSample {
    const analyser = this.analyser;
    const buffer = this.buffer;
    if (!analyser || !buffer) return SILENT_SAMPLE;

    analyser.getFloatTimeDomainData(buffer);

    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    const db = rmsToDb(rms);

    let pitch: PitchReading | null = null;
    if (this.detector && this.context) {
      const [frequency, clarity] = this.detector.findPitch(buffer, this.context.sampleRate);
      if (isUsablePitch(frequency, clarity)) pitch = describePitch(frequency);
    }

    return { rms: Math.min(1, rms), db, clipping: db >= CLIPPING_DB, pitch };
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private async loadDetector(size: number, generation: number): Promise<void> {
    try {
      const { PitchDetector } = await import("pitchy");
      if (generation !== this.generation) return;
      this.detector = PitchDetector.forFloat32Array(size);
    } catch {
      // No pitch meter, everything else still works.
    }
  }

  private async enableSuppressor(generation: number): Promise<void> {
    const context = this.context;
    const source = this.source;
    const monitorGain = this.monitorGain;
    if (!context || !source || !monitorGain || this.suppressor) return;

    try {
      const { loadRnnoise, RnnoiseWorkletNode } = await import(
        "@sapphi-red/web-noise-suppressor"
      );
      const [wasmBinary] = await Promise.all([
        loadRnnoise({ url: RNNOISE_WASM_URL, simdUrl: RNNOISE_WASM_SIMD_URL }),
        context.audioWorklet.addModule(RNNOISE_WORKLET_URL),
      ]);
      if (generation !== this.generation || !this.suppressing) return;

      const node = new RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary });
      this.suppressor = node;
      this.rewireMonitorPath();
    } catch {
      // WASM blocked, no AudioWorklet, or the fetch failed: monitoring keeps
      // working unprocessed rather than failing the whole recording.
      this.suppressor = null;
      this.suppressing = false;
    }
  }

  /** Rebuild `source -> [suppressor] -> monitorGain` without touching the analyser. */
  private rewireMonitorPath(): void {
    const source = this.source;
    const monitorGain = this.monitorGain;
    const analyser = this.analyser;
    if (!source || !monitorGain || !analyser) return;

    source.disconnect();
    source.connect(analyser);
    if (this.suppressor) {
      source.connect(this.suppressor);
      this.suppressor.disconnect();
      this.suppressor.connect(monitorGain);
    } else {
      source.connect(monitorGain);
    }
  }

  private destroySuppressor(): void {
    const node = this.suppressor;
    this.suppressor = null;
    if (!node) return;
    try {
      node.disconnect();
      (node as AudioNode & { destroy?: () => void }).destroy?.();
    } catch {
      // Already gone with its context.
    }
  }
}
