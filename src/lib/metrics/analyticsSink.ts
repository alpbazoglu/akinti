/**
 * Minimal analytics event seam (spec §40).
 *
 * No third-party analytics backend is wired into this stage — that is a
 * deliberate "don't fake it" call: there is nothing to send these events TO
 * yet. This module exists so `playTracker.ts` (and, later, the
 * save/share/comment/follow/duet events §40 also lists) has exactly one
 * place to call, and so a real sink can be plugged in later
 * (`setAnalyticsSink`) — including in tests, which inject a capturing sink
 * instead of asserting on `console.debug` output.
 */

export type AnalyticsEventName = "wave_play_started" | "wave_play_completed" | "wave_replayed";

export interface AnalyticsEvent {
  readonly name: AnalyticsEventName;
  readonly waveId: string;
  readonly sessionId: string;
  readonly at: number;
}

export type AnalyticsSink = (event: AnalyticsEvent) => void;

function defaultSink(event: AnalyticsEvent): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event.name, event);
  }
}

let sink: AnalyticsSink = defaultSink;

/** Swap the active sink — e.g. to wire a real analytics backend, or to capture events in a test. */
export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next ?? defaultSink;
}

export function emitAnalyticsEvent(event: AnalyticsEvent): void {
  sink(event);
}
