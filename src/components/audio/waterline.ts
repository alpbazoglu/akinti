/**
 * The waterline: the one drawing primitive in the product
 * (`docs/design/DESIGN.md` §6).
 *
 * It renders audio, separation, progress, history and identity, which is why
 * there is exactly one implementation of it and everything else in the system
 * is ink on paper. This module is the geometry and the drawing; the React
 * surface around it lives in `WaveformCanvas.tsx`.
 *
 * Nothing here eases. Progress, the playhead and the scrub are linear at zero
 * duration, because a playhead that eases is lying about time (§6.3, §12.7).
 */

export type WaterlineState =
  | "dormant"
  | "unplayed"
  | "playing"
  | "recording"
  | "duet";

export interface WaterlineGeometry {
  /** Bar width in CSS pixels. */
  readonly bar: number;
  /** Gap between bars in CSS pixels. */
  readonly gap: number;
  /** Bar pitch: `bar + gap`. */
  readonly pitch: number;
  /** Cap radius. Never fully rounded: 1px at large sizes is the maximum. */
  readonly cap: number;
  /** Mirrored about the centre line, with the lower half at 70% alpha. */
  readonly mirrored: boolean;
}

/**
 * Geometry is size-dependent, by rule (§6.1).
 *
 * | height   | bar | gap | pitch | caps   | mirrored |
 * | 16-28px  |  2  |  1  |   3   | square | no       |
 * | 32-38px  |  2  |  2  |   4   | square | no       |
 * | 40px+    |  3  |  2  |   5   | 1px    | yes      |
 */
export function geometryFor(height: number): WaterlineGeometry {
  if (height <= 28) return { bar: 2, gap: 1, pitch: 3, cap: 0, mirrored: false };
  if (height < 40) return { bar: 2, gap: 2, pitch: 4, cap: 0, mirrored: false };
  return { bar: 3, gap: 2, pitch: 5, cap: 1, mirrored: true };
}

/** Minimum bar height. Silence has a floor, never a hole (§6.1). */
export const MIN_BAR = 2;

/**
 * Below this amplitude a passage is true silence and is drawn as a row of 2px
 * square dots on the centre line rather than as short bars (§6.1). Apple Voice
 * Memos does this; almost nobody else does.
 */
export const SILENCE_FLOOR = 0.02;

/** The lower half of a mirrored trace renders at 70% alpha (§6.1). */
export const MIRROR_ALPHA = 0.7;

/** A partially buffered track shows what it has, at 40% alpha (§6.2). */
export const UNLOADED_ALPHA = 0.4;

/**
 * Audio the trim handles have cut away is still drawn, at 20%
 * (`docs/design/SCREENS.md` §4.3). Removing it outright would make the trace
 * jump as the handle moves and would hide what is being discarded.
 */
export const TRIMMED_ALPHA = 0.2;

/** A trim selection, as ratios of the whole take. */
export interface WaterlineTrim {
  readonly start: number;
  readonly end: number;
}

export interface WaterlineColors {
  /** The idle tick row on a recorder, and the skeleton. */
  readonly rest: string;
  /** The unplayed part of every trace. */
  readonly dormant: string;
  /** The played part. The one accent, and only here. */
  readonly played: string;
  /** The playhead and the "theirs" half of a Duet. */
  readonly ink: string;
}

export interface DrawWaterlineOptions {
  /** Normalised peak amplitudes, `0..1`. Resampled, never stretched. */
  readonly peaks: readonly number[];
  /** Second layer for a Duet: the collaborator's trace, drawn downward in ink. */
  readonly duetPeaks?: readonly number[];
  /** CSS pixel width of the drawing surface. */
  readonly width: number;
  /** CSS pixel height of the drawing surface. */
  readonly height: number;
  readonly state: WaterlineState;
  readonly colors: WaterlineColors;
  /** Playback position, `0..1`. */
  readonly progress?: number;
  /** How much of the media has buffered, `0..1`. `1` when unknown. */
  readonly loaded?: number;
  /** Draw the 2px ink playhead with its square write-head cap. */
  readonly playhead?: boolean;
  /**
   * Kept region of the take, as ratios. Everything outside it draws at
   * `TRIMMED_ALPHA` (§4.3). Omitted means "the whole take is kept".
   */
  readonly trim?: WaterlineTrim;
}

/** Resample to exactly `count` buckets, taking the peak of each bucket. */
export function resamplePeaks(peaks: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  const out = new Array<number>(count).fill(0);
  if (peaks.length === 0) return out;

  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * peaks.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / count));
    let peak = 0;
    for (let j = start; j < end && j < peaks.length; j += 1) {
      const value = Math.abs(peaks[j]);
      if (Number.isFinite(value) && value > peak) peak = value;
    }
    out[i] = Math.min(1, peak);
  }
  return out;
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, Math.max(h, MIN_BAR), radius);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, w, Math.max(h, MIN_BAR));
}

/**
 * Draw one trace into a device-pixel-ratio-scaled 2D context.
 *
 * The played/unplayed split is a clipped two-layer mask rather than per-bar
 * recolouring: the same technique that took SoundCloud from 17 FPS to 60 FPS
 * at under 20% GPU, and on mobile web the difference between smooth scrubbing
 * and jank (§6.4).
 */
export function drawWaterline(
  ctx: CanvasRenderingContext2D,
  options: DrawWaterlineOptions,
): void {
  const {
    peaks,
    duetPeaks,
    width,
    height,
    state,
    colors,
    progress = 0,
    loaded = 1,
    playhead = false,
    trim,
  } = options;

  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return;

  const geometry = geometryFor(height);
  const count = Math.max(1, Math.floor((width + geometry.gap) / geometry.pitch));
  const centre = height / 2;

  // Dormant: a row of evenly spaced 1px ticks at the rest position. Not zeros,
  // not a flat line, and never a fake waveform (§6.2).
  if (state === "dormant") {
    ctx.fillStyle = colors.rest;
    for (let i = 0; i < count; i += 1) {
      const x = Math.round(i * geometry.pitch);
      ctx.fillRect(x, Math.round(centre - 1), 1, MIN_BAR);
    }
    return;
  }

  const samples = resamplePeaks(peaks, count);
  const duetSamples = duetPeaks ? resamplePeaks(duetPeaks, count) : null;
  const progressX = Math.round(Math.min(1, Math.max(0, progress)) * width);
  const loadedX = Math.round(Math.min(1, Math.max(0, loaded)) * width);

  const paintBars = (
    fill: string,
    source: readonly number[],
    direction: "both" | "up" | "down",
  ) => {
    ctx.fillStyle = fill;
    for (let i = 0; i < count; i += 1) {
      // Whole device pixels, so edges stay crisp at any DPR (§6.1).
      const x = Math.round(i * geometry.pitch);
      const amplitude = source[i] ?? 0;

      if (amplitude < SILENCE_FLOOR) {
        // True silence: a 2px square dot on the centre line, not a short bar.
        ctx.fillRect(x, Math.round(centre - MIN_BAR / 2), MIN_BAR, MIN_BAR);
        continue;
      }

      if (!geometry.mirrored) {
        const h = Math.max(MIN_BAR, Math.round(amplitude * height));
        bar(ctx, x, Math.round(height - h), geometry.bar, h, geometry.cap);
        continue;
      }

      const half = Math.max(MIN_BAR, Math.round((amplitude * height) / 2));

      if (direction !== "down") {
        bar(ctx, x, Math.round(centre - half), geometry.bar, half, geometry.cap);
      }
      if (direction !== "up") {
        // The lower half at 70% alpha is the difference between a designed
        // mirrored trace and a CSS-default one (§6.1).
        const alpha = ctx.globalAlpha;
        if (direction === "both") ctx.globalAlpha = alpha * MIRROR_ALPHA;
        bar(ctx, x, Math.round(centre), geometry.bar, half, geometry.cap);
        ctx.globalAlpha = alpha;
      }
    }
  };

  // Duet: theirs in ink downward, yours in Signal upward, one shared playhead.
  if (state === "duet" && duetSamples) {
    paintBars(colors.ink, duetSamples, "down");
    paintBars(colors.played, samples, "up");
  } else if (state === "recording") {
    // The whole trace in Signal, drawn from RMS so it moves smoothly (§6.2).
    paintBars(colors.played, samples, "both");
  } else {
    // Layer one: the whole trace unplayed.
    paintBars(colors.dormant, samples, "both");

    // Layer two: the played region, clipped rather than recoloured per bar.
    if (state === "playing" && progressX > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, progressX, height);
      ctx.clip();
      paintBars(colors.played, samples, "both");
      ctx.restore();
    }

    // The unloaded region shows what it has, at 40% alpha (§6.2).
    if (loadedX < width) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(loadedX, 0, width - loadedX, height);
      ctx.clip();
      ctx.clearRect(loadedX, 0, width - loadedX, height);
      ctx.globalAlpha = UNLOADED_ALPHA;
      paintBars(colors.dormant, samples, "both");
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // Trimmed-away audio stays visible at 20% so the handle shows what it is
  // discarding rather than eating the trace as it moves (§4.3).
  if (trim) {
    const keepStart = Math.round(Math.min(1, Math.max(0, trim.start)) * width);
    const keepEnd = Math.round(Math.min(1, Math.max(0, trim.end)) * width);
    const dim = (from: number, to: number) => {
      if (to <= from) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(from, 0, to - from, height);
      ctx.clip();
      ctx.clearRect(from, 0, to - from, height);
      ctx.globalAlpha = TRIMMED_ALPHA;
      paintBars(colors.dormant, samples, "both");
      ctx.globalAlpha = 1;
      ctx.restore();
    };
    dim(0, keepStart);
    dim(keepEnd, width);
  }

  // The write-head: a 2px ink line spanning the full height with a 2px square
  // ink cap at the top. The playhead, not the colour, is the accessible cue
  // for the played/unplayed boundary (§6.2).
  if (playhead) {
    const x = state === "recording" ? width - MIN_BAR : progressX;
    ctx.fillStyle = colors.ink;
    ctx.fillRect(Math.round(x), 0, MIN_BAR, height);
    ctx.fillRect(Math.round(x) - 1, 0, MIN_BAR + 2, MIN_BAR + 1);
  }
}
