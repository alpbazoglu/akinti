"use client";

/**
 * Global playback store (spec section 12).
 *
 * There is exactly one `<audio>` element for the whole application and exactly
 * one Wave may play at a time. Cards subscribe to this store rather than owning
 * their own player, which keeps playback authoritative in one place and avoids
 * duplicate network requests from independent card instances.
 *
 * This layer deliberately does NOT count Plays or Replays. It emits typed
 * `progress` / `ended` events; a later metrics agent subscribes to those and
 * decides what counts, server-authoritatively (spec section 13).
 */

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

import type { WaveSurferHandle } from "./waveSurfer";

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export interface PlaybackMeta {
  /** Wave title, for media session / accessible labels. */
  readonly title?: string;
  /** Creator username without the leading `@`. */
  readonly creatorUsername?: string;
  /** Known duration in seconds, if the caller already has it. */
  readonly duration?: number;
  /**
   * Stored peaks for this Wave, when the asset has them. Passing them keeps
   * WaveSurfer from fetching the audio a second time to decode a shape we
   * already know (`docs/design/DESIGN.md` §6.4).
   */
  readonly peaks?: readonly number[];
}

export interface PlaybackState {
  readonly waveId: string | null;
  readonly src: string | null;
  readonly meta: PlaybackMeta | null;
  readonly status: PlaybackStatus;
  /** Seconds into the active Wave. */
  readonly currentTime: number;
  /** Seconds; `0` until metadata loads. */
  readonly duration: number;
  readonly error: string | null;
  readonly volume: number;
  readonly muted: boolean;
  /**
   * How much of the active Wave has buffered, `0..1`. The unloaded region of a
   * trace is drawn at 40% alpha so a partial buffer shows what it has
   * (§6.2, `mobile-guidelines.md` rule 29).
   */
  readonly buffered: number;
  /**
   * Real peaks for the active Wave, decoded from the audio when the asset had
   * none stored. `null` means "keep drawing what the caller gave us".
   */
  readonly peaks: readonly number[] | null;
}

export interface PlaybackProgressEvent {
  readonly waveId: string;
  readonly currentTime: number;
  readonly duration: number;
  /** `0..1`, or `0` when the duration is unknown. */
  readonly ratio: number;
}

export interface PlaybackEndedEvent {
  readonly waveId: string;
  readonly duration: number;
}

export type PlaybackProgressListener = (event: PlaybackProgressEvent) => void;
export type PlaybackEndedListener = (event: PlaybackEndedEvent) => void;
export type Unsubscribe = () => void;

/**
 * The subset of `HTMLAudioElement` this store touches. Declaring it explicitly
 * lets tests drive the store with a lightweight fake.
 */
export interface PlaybackAudioElement {
  src: string;
  currentTime: number;
  readonly duration: number;
  volume: number;
  muted: boolean;
  preload: string;
  crossOrigin: string | null;
  /** Buffered time ranges, when the element exposes them. */
  readonly buffered?: TimeRanges;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface PlaybackStoreOptions {
  /** Factory for the single media element. Overridden in tests. */
  readonly createAudio?: () => PlaybackAudioElement;
  readonly initialVolume?: number;
}

const INITIAL_STATE: PlaybackState = {
  waveId: null,
  src: null,
  meta: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  error: null,
  volume: 1,
  muted: false,
  buffered: 0,
  peaks: null,
};

const MEDIA_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "durationchange",
  "canplay",
  "playing",
  "play",
  "pause",
  "waiting",
  "progress",
  "timeupdate",
  "ended",
  "error",
  "volumechange",
] as const;

function defaultCreateAudio(): PlaybackAudioElement {
  const element = document.createElement("audio");
  element.preload = "metadata";
  return element as unknown as PlaybackAudioElement;
}

function safeDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export class PlaybackStore {
  private state: PlaybackState;
  private readonly listeners = new Set<() => void>();
  private readonly progressListeners = new Set<PlaybackProgressListener>();
  private readonly endedListeners = new Set<PlaybackEndedListener>();
  private readonly createAudio: () => PlaybackAudioElement;
  private audio: PlaybackAudioElement | null = null;
  private boundHandlers: { type: string; handler: () => void }[] = [];
  private waveSurfer: WaveSurferHandle | null = null;
  private waveSurferToken = 0;

  constructor(options: PlaybackStoreOptions = {}) {
    this.createAudio = options.createAudio ?? defaultCreateAudio;
    this.state = {
      ...INITIAL_STATE,
      volume: options.initialVolume ?? INITIAL_STATE.volume,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Subscription surface (useSyncExternalStore)                      */
  /* ---------------------------------------------------------------- */

  readonly subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getState = (): PlaybackState => this.state;

  /** Server snapshot: playback never starts during SSR. */
  readonly getServerState = (): PlaybackState => INITIAL_STATE;

  /** Subscribe to raw progress ticks. Metrics logic lives elsewhere. */
  onProgress(listener: PlaybackProgressListener): Unsubscribe {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  /** Subscribe to completed playback. Metrics logic lives elsewhere. */
  onEnded(listener: PlaybackEndedListener): Unsubscribe {
    this.endedListeners.add(listener);
    return () => {
      this.endedListeners.delete(listener);
    };
  }

  /* ---------------------------------------------------------------- */
  /* Commands                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Start (or restart) playback of a Wave. Any other playing Wave stops
   * immediately: there is only ever one active Wave.
   */
  play(waveId: string, src: string, meta: PlaybackMeta = {}): void {
    const audio = this.ensureAudio();
    if (!audio) return;

    const isSameWave = this.state.waveId === waveId && this.state.src === src;

    if (!isSameWave) {
      audio.pause();
      audio.src = src;
      audio.load?.();
      this.setState({
        waveId,
        src,
        meta,
        status: "loading",
        currentTime: 0,
        duration: safeDuration(meta.duration ?? 0),
        error: null,
        buffered: 0,
        peaks: null,
      });
      this.attachAnalysis(audio, meta);
    } else {
      this.setState({ meta, status: "loading", error: null });
    }

    this.publishMediaSession(meta);
    void this.startPlayback(audio);
  }

  /** Resume the currently loaded Wave, if any. */
  resume(): void {
    const audio = this.audio;
    if (!audio || !this.state.waveId) return;
    this.setState({ error: null });
    void this.startPlayback(audio);
  }

  pause(): void {
    this.audio?.pause();
    if (this.state.status === "playing" || this.state.status === "loading") {
      this.setState({ status: "paused" });
    }
  }

  /** Play if this Wave is paused/idle, pause if it is the one playing. */
  toggle(waveId: string, src: string, meta: PlaybackMeta = {}): void {
    const isActive = this.state.waveId === waveId;
    if (isActive && (this.state.status === "playing" || this.state.status === "loading")) {
      this.pause();
      return;
    }
    if (isActive && this.state.status === "paused") {
      this.resume();
      return;
    }
    this.play(waveId, src, meta);
  }

  /** Seek the active Wave to `seconds`. */
  seek(seconds: number): void {
    const audio = this.audio;
    const clamped = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const bounded = this.state.duration > 0 ? Math.min(clamped, this.state.duration) : clamped;

    if (audio) audio.currentTime = bounded;
    this.setState({ currentTime: bounded, status: this.state.status === "ended" ? "paused" : this.state.status });
  }

  /** Seek by ratio of the total duration (`0..1`). */
  seekToRatio(ratio: number): void {
    if (this.state.duration <= 0) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    this.seek(clamped * this.state.duration);
  }

  /** Stop playback and clear the active Wave. */
  stop(): void {
    this.audio?.pause();
    if (this.audio) this.audio.currentTime = 0;
    this.detachAnalysis();
    this.setState({
      waveId: null,
      src: null,
      meta: null,
      status: "idle",
      currentTime: 0,
      duration: 0,
      error: null,
      buffered: 0,
      peaks: null,
    });
  }

  setVolume(volume: number): void {
    const clamped = Math.min(1, Math.max(0, volume));
    if (this.audio) this.audio.volume = clamped;
    this.setState({ volume: clamped });
  }

  setMuted(muted: boolean): void {
    if (this.audio) this.audio.muted = muted;
    this.setState({ muted });
  }

  /** Detach listeners and release the media element. */
  destroy(): void {
    this.detachAnalysis();
    this.detachHandlers();
    this.audio?.pause();
    this.audio = null;
    this.listeners.clear();
    this.progressListeners.clear();
    this.endedListeners.clear();
    this.state = INITIAL_STATE;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  /** The one media element, once it exists. Nothing else may create another. */
  getMediaElement(): PlaybackAudioElement | null {
    return this.audio;
  }

  /**
   * Bind the single WaveSurfer instance to the single `<audio>`
   * (`docs/research/libraries.md` §2). Imported dynamically, so it never
   * enters the initial bundle (`mobile-guidelines.md` rule 44), and replaced
   * rather than stacked when the active Wave changes.
   */
  private attachAnalysis(audio: PlaybackAudioElement, meta: PlaybackMeta): void {
    this.detachAnalysis();
    if (typeof document === "undefined") return;

    const token = (this.waveSurferToken += 1);
    const waveId = this.state.waveId;

    void import("./waveSurfer")
      .then(({ attachWaveSurfer }) =>
        attachWaveSurfer(audio, {
          peaks: meta.peaks,
          duration: meta.duration,
          onPeaks: (peaks) => {
            // A late decode must not repaint a Wave the reader has moved on from.
            if (token !== this.waveSurferToken || this.state.waveId !== waveId) return;
            this.setState({ peaks });
          },
        }),
      )
      .then((handle) => {
        if (token !== this.waveSurferToken) {
          handle?.destroy();
          return;
        }
        this.waveSurfer = handle;
      })
      .catch(() => {
        // Analysis is an upgrade, never a dependency: playback is already
        // running on the media element by the time this resolves.
      });
  }

  private detachAnalysis(): void {
    this.waveSurferToken += 1;
    this.waveSurfer?.destroy();
    this.waveSurfer = null;
  }

  /**
   * Lock-screen and notification-shade controls (§8.4,
   * `mobile-guidelines.md` rule 30). Artwork is deliberately absent: a Wave
   * has no cover image, and inventing one would be the stock-art this product
   * does not have (§10).
   */
  private publishMediaSession(meta: PlaybackMeta): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    try {
      session.metadata = new MediaMetadata({
        title: meta.title ?? "Wave",
        artist: meta.creatorUsername ? `@${meta.creatorUsername}` : "AKINTI",
        album: "AKINTI",
      });
      session.setActionHandler("play", () => this.resume());
      session.setActionHandler("pause", () => this.pause());
      session.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") this.seek(details.seekTime);
      });
      session.setActionHandler("seekbackward", () => this.seek(this.state.currentTime - 15));
      session.setActionHandler("seekforward", () => this.seek(this.state.currentTime + 15));
    } catch {
      // Media Session is best-effort: Safari rejects some handlers outright.
    }
  }

  private ensureAudio(): PlaybackAudioElement | null {
    if (this.audio) return this.audio;
    if (typeof document === "undefined" && this.createAudio === defaultCreateAudio) {
      return null;
    }

    const audio = this.createAudio();
    audio.volume = this.state.volume;
    audio.muted = this.state.muted;
    this.audio = audio;
    this.attachHandlers(audio);
    return audio;
  }

  private attachHandlers(audio: PlaybackAudioElement): void {
    for (const type of MEDIA_EVENTS) {
      const handler = () => {
        this.handleMediaEvent(type);
      };
      audio.addEventListener(type, handler);
      this.boundHandlers.push({ type, handler });
    }
  }

  private detachHandlers(): void {
    const audio = this.audio;
    if (audio) {
      for (const { type, handler } of this.boundHandlers) {
        audio.removeEventListener(type, handler);
      }
    }
    this.boundHandlers = [];
  }

  private async startPlayback(audio: PlaybackAudioElement): Promise<void> {
    try {
      await audio.play();
      // `playing` normally arrives via the media event; set it eagerly for
      // environments that do not emit one, so the transport never lies.
      if (this.state.status !== "error" && this.state.status !== "playing") {
        this.setState({ status: "playing" });
      }
    } catch {
      this.setState({
        status: "error",
        error: "Playback could not start. Check your connection and try again.",
      });
    }
  }

  private handleMediaEvent(type: string): void {
    const audio = this.audio;
    if (!audio) return;

    switch (type) {
      case "loadstart":
        this.setState({ status: "loading" });
        break;
      case "loadedmetadata":
      case "durationchange":
        this.setState({ duration: safeDuration(audio.duration) });
        break;
      case "canplay":
        if (this.state.status === "loading" || this.state.status === "buffering") {
          this.setState({ status: "paused" });
        }
        break;
      case "waiting":
        this.setState({ status: "buffering" });
        break;
      case "progress": {
        const duration = safeDuration(audio.duration) || this.state.duration;
        const ranges = audio.buffered;
        if (!ranges || duration <= 0 || ranges.length === 0) break;
        const end = ranges.end(ranges.length - 1);
        this.setState({ buffered: Math.min(1, Math.max(0, end / duration)) });
        break;
      }
      case "play":
      case "playing":
        this.setState({ status: "playing", error: null });
        break;
      case "pause":
        if (this.state.status !== "ended") this.setState({ status: "paused" });
        break;
      case "timeupdate": {
        const duration = safeDuration(audio.duration) || this.state.duration;
        const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        this.setState({ currentTime, duration });
        this.emitProgress(currentTime, duration);
        break;
      }
      case "ended": {
        const duration = safeDuration(audio.duration) || this.state.duration;
        this.setState({ status: "ended", currentTime: duration });
        this.emitEnded(duration);
        break;
      }
      case "volumechange":
        this.setState({ volume: audio.volume, muted: audio.muted });
        break;
      case "error":
        this.setState({
          status: "error",
          error: "This Wave could not be played right now.",
        });
        break;
      default:
        break;
    }
  }

  private emitProgress(currentTime: number, duration: number): void {
    const { waveId } = this.state;
    if (!waveId) return;
    const event: PlaybackProgressEvent = {
      waveId,
      currentTime,
      duration,
      ratio: duration > 0 ? Math.min(1, currentTime / duration) : 0,
    };
    for (const listener of this.progressListeners) listener(event);
  }

  private emitEnded(duration: number): void {
    const { waveId } = this.state;
    if (!waveId) return;
    const event: PlaybackEndedEvent = { waveId, duration };
    for (const listener of this.endedListeners) listener(event);
  }

  private setState(patch: Partial<PlaybackState>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof PlaybackState)[]) {
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

export function createPlaybackStore(options?: PlaybackStoreOptions): PlaybackStore {
  return new PlaybackStore(options);
}

/* ------------------------------------------------------------------ */
/* React bindings                                                      */
/* ------------------------------------------------------------------ */

export const PlaybackStoreContext = createContext<PlaybackStore | null>(null);

export function usePlaybackStore(): PlaybackStore {
  const store = useContext(PlaybackStoreContext);
  if (!store) {
    throw new Error("usePlaybackStore must be used inside <PlaybackProvider>.");
  }
  return store;
}

/** Subscribe to a slice of playback state. */
export function usePlaybackSelector<T>(selector: (state: PlaybackState) => T): T {
  const store = usePlaybackStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getServerState()),
  );
}

export function usePlaybackState(): PlaybackState {
  return usePlaybackSelector((state) => state);
}

export interface WavePlaybackSnapshot {
  readonly isActive: boolean;
  readonly isPlaying: boolean;
  readonly isBusy: boolean;
  readonly status: PlaybackStatus;
  readonly currentTime: number;
  readonly duration: number;
  readonly error: string | null;
  /** Buffered fraction, `0..1`. `1` for a Wave that is not the active one. */
  readonly buffered: number;
  /** Decoded peaks for the active Wave, or `null` to keep the stored shape. */
  readonly peaks: readonly number[] | null;
}

/** Playback state scoped to a single Wave. */
export function useWavePlayback(waveId: string, fallbackDuration = 0): WavePlaybackSnapshot {
  const isActive = usePlaybackSelector((state) => state.waveId === waveId);
  const status = usePlaybackSelector((state) =>
    state.waveId === waveId ? state.status : ("idle" as PlaybackStatus),
  );
  const currentTime = usePlaybackSelector((state) =>
    state.waveId === waveId ? state.currentTime : 0,
  );
  const duration = usePlaybackSelector((state) =>
    state.waveId === waveId && state.duration > 0 ? state.duration : fallbackDuration,
  );
  const error = usePlaybackSelector((state) =>
    state.waveId === waveId ? state.error : null,
  );
  // A Wave that is not playing has nothing to say about buffering, so it draws
  // its full trace rather than a 40%-alpha unloaded region.
  const buffered = usePlaybackSelector((state) =>
    state.waveId === waveId ? state.buffered : 1,
  );
  const peaks = usePlaybackSelector((state) =>
    state.waveId === waveId ? state.peaks : null,
  );

  return {
    isActive,
    isPlaying: status === "playing",
    isBusy: status === "loading" || status === "buffering",
    status,
    currentTime,
    duration,
    error,
    buffered: isActive && status !== "idle" ? buffered : 1,
    peaks,
  };
}

/** Stable `play` / `pause` / `toggle` / `seek` callbacks for one Wave. */
export function useWaveControls(waveId: string, src: string, meta?: PlaybackMeta) {
  const store = usePlaybackStore();
  const title = meta?.title;
  const creatorUsername = meta?.creatorUsername;
  const duration = meta?.duration;
  const peaks = meta?.peaks;

  const play = useCallback(() => {
    store.play(waveId, src, { title, creatorUsername, duration, peaks });
  }, [store, waveId, src, title, creatorUsername, duration, peaks]);

  const toggle = useCallback(() => {
    store.toggle(waveId, src, { title, creatorUsername, duration, peaks });
  }, [store, waveId, src, title, creatorUsername, duration, peaks]);

  const pause = useCallback(() => {
    store.pause();
  }, [store]);

  const seek = useCallback(
    (seconds: number) => {
      if (store.getState().waveId !== waveId) return;
      store.seek(seconds);
    },
    [store, waveId],
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (store.getState().waveId !== waveId) return;
      store.seekToRatio(ratio);
    },
    [store, waveId],
  );

  return { play, pause, toggle, seek, seekToRatio };
}
