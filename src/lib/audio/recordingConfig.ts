/**
 * Limits and timings for in-app recording.
 *
 * `MAX_AUDIO_DURATION_MS` (`src/lib/supabase/config.ts`, mirrored by a CHECK
 * constraint on `audio_assets`) is the hard ceiling for *any* audio in this
 * system, uploads included — thirty minutes. A live take is a different
 * thing: the record screen prints `0:00 / 5:00` (`docs/design/SCREENS.md`
 * §4.1), a phone tab holding half an hour of PCM in memory is a crash, and
 * nobody sings for thirty minutes in one pass. So capture stops at five
 * minutes and long-form audio comes in through the upload path, which has no
 * such problem.
 *
 * `Math.min` against the storage limit rather than a bare constant, so
 * lowering the platform ceiling can never leave the recorder producing takes
 * the server would reject.
 */

import { MAX_AUDIO_DURATION_MS } from "@/lib/supabase/config";

/** Auto-stop threshold for a live take. */
export const MAX_RECORDING_MS = Math.min(5 * 60 * 1000, MAX_AUDIO_DURATION_MS);

/** The 3-2-1 before capture starts (`mobile-guidelines.md` rule 15). */
export const COUNTDOWN_SECONDS = 3;

/**
 * How much of the take the live trace shows: the last ten seconds, scrolling
 * right to left (`docs/design/DESIGN.md` §6.2).
 */
export const LIVE_WINDOW_MS = 10_000;

/** Peak buckets decoded for the local review trace. */
export const REVIEW_PEAK_BUCKETS = 240;

/** Peak buckets for the small strip on the details step. */
export const STRIP_PEAK_BUCKETS = 96;
