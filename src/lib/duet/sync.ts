/**
 * Pure offset/sync math for the Duet recorder (spec §15 "Duet recording &
 * synchronization"). Kept separate from `DuetRecorder.tsx` so the arithmetic
 * — the part that actually has to be correct — is testable without mounting
 * a component or touching the Web Audio API.
 *
 * Sync model: the original plays through a local `<audio>` element while the
 * contributor records. The base offset is how far into the original's
 * playback the recording actually started — measured as the original
 * element's `currentTime` at the moment the recorder transitions into
 * `"recording"` (not at the button click, which race against microphone
 * permission latency). A signed manual nudge, in `OFFSET_NUDGE_STEP_MS`
 * increments, corrects for the small human delay between hearing a cue and
 * actually starting to sing/speak — it may push the effective offset
 * negative (the contribution starts slightly BEFORE the original), which
 * `buildDuetMixFilterComplex` (`src/lib/duet/ffmpegChain.ts`) handles by
 * delaying the reference stem instead of the contribution.
 */

import { MAX_AUDIO_DURATION_MS } from "@/lib/supabase/config";

export const OFFSET_NUDGE_STEP_MS = 500;

/** How far the nudge alone may move the offset in either direction. */
export const MAX_NUDGE_MS = 10_000;

/**
 * The measured base offset: how many milliseconds of the original had
 * already played when recording began. Never negative — you cannot start
 * recording before pressing play on the original in this flow, only nudge
 * the result negative afterward.
 */
export function computeBaseOffsetMs(originalElapsedMsAtRecordStart: number): number {
  if (!Number.isFinite(originalElapsedMsAtRecordStart)) return 0;
  return Math.max(0, Math.round(originalElapsedMsAtRecordStart));
}

export function clampNudgeMs(nudgeMs: number): number {
  if (!Number.isFinite(nudgeMs)) return 0;
  return Math.max(-MAX_NUDGE_MS, Math.min(MAX_NUDGE_MS, Math.round(nudgeMs)));
}

/**
 * Final offset sent to the server: base + nudge, clamped to a sane range.
 * Allowed to go negative (contribution starts before the reference) — only
 * the upper bound (a full Wave's max duration) and a symmetric lower bound
 * guard against a corrupted/adversarial value reaching the mix job.
 */
export function resolveOffsetMs(baseOffsetMs: number, nudgeMs: number): number {
  const base = computeBaseOffsetMs(baseOffsetMs);
  const nudge = clampNudgeMs(nudgeMs);
  const total = base + nudge;
  return Math.max(-MAX_AUDIO_DURATION_MS, Math.min(MAX_AUDIO_DURATION_MS, Math.round(total)));
}

/**
 * Client-side preview scheduling: given `offsetMs`, how long (in ms) to
 * delay starting each of the two `<audio>` elements so the preview matches
 * what the server-side mix will produce. Mirrors
 * `buildDuetMixFilterComplex`'s delay assignment exactly — whichever stem
 * would start later gets the delay, the other starts immediately.
 */
export interface PreviewSchedule {
  readonly referenceDelayMs: number;
  readonly contributionDelayMs: number;
}

export function computePreviewSchedule(offsetMs: number): PreviewSchedule {
  const rounded = Math.round(offsetMs);
  return {
    referenceDelayMs: Math.max(0, -rounded),
    contributionDelayMs: Math.max(0, rounded),
  };
}
