"use client";

/**
 * Client-side Play/Replay tracker (spec §13, §40).
 *
 * Subscribes to the global playback store's raw `progress`/`ended` events
 * and decides WHEN it's worth asking the server whether a listen qualifies.
 * `record_play_event` (migration 11) is the sole authority on what counts as
 * a Play or a Replay — this module only decides how often to call it and
 * translates the outcome into analytics events. The exact thresholds
 * mirrored below MUST match `play_qualifying_ms()`/`record_play_event()`
 * exactly (see "Play and Replay" in docs/AUDIO_ARCHITECTURE.md).
 *
 * Guarded against rerender double-firing at the module level: `attach` is
 * idempotent per `PlaybackStore` instance (a `WeakSet`), so every
 * `WaveCardContainer` in a feed may call `usePlayTracker()` — only the first
 * one to run actually subscribes; the store itself is an app-wide singleton
 * (`PlaybackProvider`), so this guarantees exactly one listener per event,
 * ever, regardless of how many cards are mounted.
 */

import { useEffect } from "react";

import {
  usePlaybackStore,
  type PlaybackEndedEvent,
  type PlaybackProgressEvent,
  type PlaybackStore,
} from "@/lib/audio";

import { reportPlayback } from "./actions";
import { emitAnalyticsEvent } from "./analyticsSink";
import { getOrCreateSessionId } from "./sessionId";

/** Mirrors `play_qualifying_ms()` (migration 11) exactly: max(1000, min(3000, 30% of duration)). */
export const PLAY_QUALIFYING_MIN_MS = 1000;
export const PLAY_QUALIFYING_MAX_MS = 3000;
export const PLAY_QUALIFYING_RATIO = 0.3;
/** Mirrors `record_play_event`'s completion rule exactly. */
export const COMPLETION_RATIO = 0.9;
/**
 * A seek (or a loop back to 0) can jump `currentTime` by more than real
 * elapsed time; deltas bigger than this are treated as "not continuous
 * listening" and dropped rather than added to the running total.
 */
const MAX_CONTINUOUS_DELTA_SECONDS = 2;

/** The exact qualifying threshold for a clip of `durationMs`, mirroring the server-side SQL function. */
export function playQualifyingMs(durationMs: number | null | undefined): number {
  const base = durationMs && durationMs > 0 ? durationMs : 10_000;
  return Math.max(
    PLAY_QUALIFYING_MIN_MS,
    Math.min(PLAY_QUALIFYING_MAX_MS, Math.ceil(base * PLAY_QUALIFYING_RATIO)),
  );
}

interface WaveListenSession {
  lastTime: number;
  listenedMs: number;
  qualifyingReported: boolean;
  completedFired: boolean;
}

const trackedStores = new WeakSet<PlaybackStore>();

function attach(store: PlaybackStore): void {
  if (trackedStores.has(store)) return;
  trackedStores.add(store);

  const sessions = new Map<string, WaveListenSession>();

  const sessionFor = (waveId: string): WaveListenSession => {
    let session = sessions.get(waveId);
    if (!session) {
      session = { lastTime: 0, listenedMs: 0, qualifyingReported: false, completedFired: false };
      sessions.set(waveId, session);
    }
    return session;
  };

  const report = (waveId: string, listenedMs: number, durationMs: number, completed: boolean): void => {
    const sessionId = getOrCreateSessionId();
    reportPlayback({
      waveId,
      sessionId,
      listenedMs: Math.max(0, Math.round(listenedMs)),
      durationMs: durationMs > 0 ? Math.round(durationMs) : undefined,
      completed,
    })
      .then((outcome) => {
        if (outcome.countedPlay) {
          emitAnalyticsEvent({ name: "wave_play_started", waveId, sessionId, at: Date.now() });
        }
        if (outcome.countedReplay) {
          emitAnalyticsEvent({ name: "wave_replayed", waveId, sessionId, at: Date.now() });
        }
      })
      .catch(() => {
        // Metrics must never surface an error to the listener.
      });
  };

  const handleProgress = (event: PlaybackProgressEvent): void => {
    const session = sessionFor(event.waveId);
    const delta = event.currentTime - session.lastTime;
    session.lastTime = event.currentTime;

    if (delta > 0 && delta <= MAX_CONTINUOUS_DELTA_SECONDS) {
      session.listenedMs += delta * 1000;
    }

    const durationMs = event.duration * 1000;

    if (!session.qualifyingReported && session.listenedMs >= playQualifyingMs(durationMs || null)) {
      session.qualifyingReported = true;
      report(event.waveId, session.listenedMs, durationMs, false);
    }

    if (!session.completedFired && durationMs > 0 && session.listenedMs >= durationMs * COMPLETION_RATIO) {
      session.completedFired = true;
      emitAnalyticsEvent({
        name: "wave_play_completed",
        waveId: event.waveId,
        sessionId: getOrCreateSessionId(),
        at: Date.now(),
      });
      report(event.waveId, session.listenedMs, durationMs, true);
    }
  };

  const handleEnded = (event: PlaybackEndedEvent): void => {
    const session = sessionFor(event.waveId);
    const durationMs = event.duration * 1000;

    if (!session.completedFired) {
      session.completedFired = true;
      emitAnalyticsEvent({
        name: "wave_play_completed",
        waveId: event.waveId,
        sessionId: getOrCreateSessionId(),
        at: Date.now(),
      });
      report(event.waveId, session.listenedMs, durationMs, true);
    }

    // A later replay of the same Wave is a new listen occurrence for our own
    // "when to report" bookkeeping — the server's 60s Replay gate
    // (`wave_listens.play_counted_at`) is independent and authoritative, so
    // resetting this local session cannot inflate what actually gets counted.
    sessions.delete(event.waveId);
  };

  store.onProgress(handleProgress);
  store.onEnded(handleEnded);
}

/**
 * Wire the Play/Replay tracker into the app's active playback store. Safe to
 * call from every `WaveCardContainer` — attaching is idempotent per store.
 */
export function usePlayTracker(): void {
  const store = usePlaybackStore();
  useEffect(() => {
    attach(store);
  }, [store]);
}

/** Test-only escape hatch: lets `playTracker.test.ts` attach to a fresh store per test without the WeakSet remembering it. */
export const __internal = { attach, trackedStores };
