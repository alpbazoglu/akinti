/**
 * Trim arithmetic for the review step (`docs/design/SCREENS.md` §4.3).
 *
 * Two handles on the finished trace, the trimmed-away regions drawn at 20%.
 * All of the maths is here, pure, because "the handle you dragged is the
 * handle that moved, and it never crosses the other one" is exactly the sort
 * of thing that is obvious until a pointer event arrives out of order.
 *
 * Everything is milliseconds. Ratios are derived, never stored: storing a
 * ratio and multiplying it back out drifts the trim by a frame every time the
 * duration is refined after decoding.
 */

export interface TrimRange {
  readonly startMs: number;
  readonly endMs: number;
}

/** Which handle a gesture is moving. */
export type TrimHandle = "start" | "end";

/**
 * The shortest take worth keeping. Below a second there is nothing to hear,
 * and a zero-length trim would publish silence.
 */
export const MIN_TRIMMED_MS = 1000;

/** The whole take, untrimmed. */
export function fullRange(durationMs: number): TrimRange {
  return { startMs: 0, endMs: Math.max(0, Math.round(durationMs)) };
}

function clampMs(value: number, durationMs: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(durationMs), Math.round(value)));
}

/**
 * Keep a range inside the take and at least `MIN_TRIMMED_MS` long.
 *
 * When the two handles would cross, the one that did NOT move is the one that
 * gives way — dragging the start handle past the end should shorten the take
 * from the front, not silently jump the end marker somewhere the user did not
 * put it.
 */
export function clampTrim(
  range: TrimRange,
  durationMs: number,
  moved: TrimHandle = "start",
): TrimRange {
  const total = Math.max(0, Math.round(durationMs));
  if (total <= MIN_TRIMMED_MS) return fullRange(total);

  let startMs = clampMs(range.startMs, total);
  let endMs = clampMs(range.endMs, total);

  if (endMs - startMs >= MIN_TRIMMED_MS) return { startMs, endMs };

  if (moved === "start") {
    startMs = Math.min(startMs, total - MIN_TRIMMED_MS);
    endMs = Math.max(endMs, startMs + MIN_TRIMMED_MS);
  } else {
    endMs = Math.max(endMs, MIN_TRIMMED_MS);
    startMs = Math.min(startMs, endMs - MIN_TRIMMED_MS);
  }

  return { startMs: Math.max(0, startMs), endMs: Math.min(total, endMs) };
}

/** How long the take is after trimming. */
export function trimmedDurationMs(range: TrimRange): number {
  return Math.max(0, range.endMs - range.startMs);
}

/** True when the handles have actually been moved off the ends. */
export function isTrimmed(range: TrimRange, durationMs: number): boolean {
  const total = Math.max(0, Math.round(durationMs));
  return range.startMs > 0 || range.endMs < total;
}

/** Position of `ms` along the trace, `0..1`. */
export function ratioOf(ms: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, ms / durationMs));
}

/** The inverse: where a pointer at `ratio` sits in the take, in ms. */
export function msAtRatio(ratio: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * durationMs);
}

/**
 * Which handle a pointer at `ratio` is closest to. Used so a tap anywhere on
 * the trace grabs the nearer handle rather than requiring a hit on a 2px line.
 */
export function nearestHandle(ratio: number, range: TrimRange, durationMs: number): TrimHandle {
  const startRatio = ratioOf(range.startMs, durationMs);
  const endRatio = ratioOf(range.endMs, durationMs);
  return Math.abs(ratio - startRatio) <= Math.abs(ratio - endRatio) ? "start" : "end";
}
