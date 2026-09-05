/**
 * Pure ffmpeg filter-chain builders for `scripts/worker.ts` (spec §15, §19,
 * §34). Extracted so the actual filter-graph string construction can be unit
 * tested without ffmpeg installed — `scripts/worker.ts` imports these and
 * only adds process spawning around them.
 *
 * Two things this module fixes relative to the previous worker behaviour
 * (see the Stage 9 brief):
 *
 *  1. **Advanced EQ was accepted into the job payload
 *     (`enqueueAudioProcessing`/`enqueueDuetMix` in
 *     `src/lib/db/audioAssets.ts`) but never applied.** `buildAdvancedEqFilter`
 *     turns the 5-band `AdvancedEqSettings` (`src/lib/audio/enhancement.ts`)
 *     into the same `equalizer=f=<hz>:t=q:w=1:g=<db>` ffmpeg syntax already
 *     used by `PRESET_FILTERS` in the worker, so it composes with a preset
 *     filter chain via a trailing comma-join.
 *
 *  2. **`adelay` was always applied to the new take, even when the
 *     contribution was recorded to start BEFORE the original** (a negative
 *     offset — the contributor let their mic run a moment ahead of pressing
 *     play, or nudged the sync earlier). `buildDuetMixFilterComplex` delays
 *     whichever stem needs to start later: the contribution for `offsetMs >=
 *     0`, the reference for `offsetMs < 0`. `adelay` itself only accepts a
 *     non-negative delay, so the sign is resolved by choosing which input
 *     gets delayed, never by passing a negative value to `adelay`.
 *
 * The enhancement preset (and, now, the advanced EQ) is applied to the
 * CONTRIBUTION stem alone, before mixing — not to the combined output as the
 * original implementation did. Processing only the new take (leaving the
 * reference, which already carries its own creator-chosen processing,
 * untouched) is what "enhance the contribution" means; running the preset
 * over the already-mixed pair a second time double-processes the original.
 */

import type { AudioEnhancementPreset } from "@/types/domain";

/** Mirrors `AdvancedEqSettings` in `src/lib/audio/enhancement.ts` without importing client-only code into the worker. */
export type AdvancedEqPayload = Readonly<Partial<Record<60 | 250 | 1000 | 4000 | 12000, number>>>;

/** Must match `ADVANCED_EQ_BANDS` in `src/lib/audio/enhancement.ts` exactly. */
export const ADVANCED_EQ_BANDS = [60, 250, 1000, 4000, 12000] as const;
export const ADVANCED_EQ_MAX_GAIN_DB = 12;

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ADVANCED_EQ_MAX_GAIN_DB, Math.max(-ADVANCED_EQ_MAX_GAIN_DB, value));
}

/**
 * Build the 5-band `equalizer=...` filter chain for an advanced EQ payload,
 * or `null` when there is nothing to apply (no payload at all — a payload
 * with every band at `0` still produces a chain; peaking filters at 0 dB
 * gain are audibly inert but explicit, which keeps this function's output
 * deterministic and simple to test rather than "sometimes shorter").
 */
export function buildAdvancedEqFilter(eq: AdvancedEqPayload | null | undefined): string | null {
  if (!eq) return null;
  return ADVANCED_EQ_BANDS.map(
    (band) => `equalizer=f=${band}:t=q:w=1:g=${clampGain(eq[band] ?? 0)}`,
  ).join(",");
}

/** Join a preset's base filter chain with an optional advanced-EQ chain (spec §19: "opt-in and secondary to the presets"). */
export function composeFilterChain(base: string, advancedEqFilter: string | null): string {
  return advancedEqFilter ? `${base},${advancedEqFilter}` : base;
}

/** Everything the worker needs to run one `process_audio` job's `-af` pass. */
export function buildProcessAudioFilterChain(
  presetFilter: string,
  advancedEq: AdvancedEqPayload | null | undefined,
): string {
  return composeFilterChain(presetFilter, buildAdvancedEqFilter(advancedEq));
}

export interface DuetMixChainOptions {
  /**
   * Start of the contribution relative to the reference, in milliseconds.
   * Positive: the contribution starts after the reference (typical — the
   * contributor let the original play a moment before joining in).
   * Negative: the contribution starts before the reference.
   */
  readonly offsetMs: number;
  /** The chosen enhancement preset's base ffmpeg filter, e.g. `PRESET_FILTERS.studio`. */
  readonly presetFilter: string;
  readonly advancedEq?: AdvancedEqPayload | null;
  /**
   * Gain applied to the REFERENCE stem (`[0:a]`) before mixing, in dB.
   * `0` for an ordinary Duet (the reference plays at its own level).
   * Backing-track Waves (spec §4 — `publishWave`'s `backingTrackId`) default
   * this to `-6` so the vocal, not the instrumental, sits in front — see
   * `enqueueBackingTrackMixJob` in `src/lib/db/backingTracks.ts` and
   * `docs/AUDIO_ARCHITECTURE.md` "Backing tracks".
   */
  readonly referenceGainDb?: number;
}

export interface DuetMixChainResult {
  /** The complete `-filter_complex` argument. */
  readonly filterComplex: string;
  /** The `-map` argument selecting the mixed output. */
  readonly outputMap: string;
  /** Milliseconds the reference input (`[0:a]`) is delayed — 0 unless `offsetMs` was negative. */
  readonly referenceDelayMs: number;
  /** Milliseconds the contribution input (`[1:a]`) is delayed — 0 unless `offsetMs` was positive. */
  readonly contributionDelayMs: number;
}

/**
 * Build the `-filter_complex` graph for a Duet mixdown. Expects ffmpeg to be
 * invoked with the reference as input `0` and the contribution as input `1`
 * (`-i <reference> -i <contribution>`), matching `runMixDuetJob` in
 * `scripts/worker.ts`.
 *
 * Graph shape:
 *   `[1:a]adelay=<contributionDelayMs>:all=1,<presetFilter>[,<eqFilter>]?[contrib]`
 *   `[0:a]adelay=<referenceDelayMs>:all=1[ref]`
 *   `[ref][contrib]amix=inputs=2:duration=longest:dropout_transition=2[mixed]`
 *
 * Exactly one of the two delays is non-zero (or both are zero, for a
 * simultaneous start) — see the sign-handling note in the file header.
 */
export function buildDuetMixFilterComplex(options: DuetMixChainOptions): DuetMixChainResult {
  const offsetMs = Math.round(options.offsetMs);
  const contributionDelayMs = Math.max(0, offsetMs);
  const referenceDelayMs = Math.max(0, -offsetMs);
  const referenceGainDb = options.referenceGainDb ?? 0;

  const advancedEqFilter = buildAdvancedEqFilter(options.advancedEq);
  const contributionFilters = [
    `adelay=${contributionDelayMs}:all=1`,
    options.presetFilter,
    advancedEqFilter,
  ]
    .filter((step): step is string => Boolean(step))
    .join(",");

  const referenceFilters = [`adelay=${referenceDelayMs}:all=1`, referenceGainDb !== 0 ? `volume=${referenceGainDb}dB` : null]
    .filter((step): step is string => Boolean(step))
    .join(",");

  const filterComplex =
    `[1:a]${contributionFilters}[contrib];` +
    `[0:a]${referenceFilters}[ref];` +
    `[ref][contrib]amix=inputs=2:duration=longest:dropout_transition=2[mixed]`;

  return {
    filterComplex,
    outputMap: "[mixed]",
    referenceDelayMs,
    contributionDelayMs,
  };
}

/** Narrow, runtime-checked read of a `mix_duet` job's `payload` column (jsonb — `unknown` until proven otherwise). */
export interface MixDuetJobPayload {
  readonly preset?: AudioEnhancementPreset;
  readonly referenceAssetId: string;
  readonly offsetMs: number;
  readonly advancedEq: AdvancedEqPayload | null;
  /** dB gain applied to the reference stem before mixing — see `DuetMixChainOptions.referenceGainDb`. `0` unless the payload sets it (backing-track mixes only). */
  readonly referenceGainDb: number;
  /** Wave D. Defaults to `"layer"` (the original, only-ever mode) when absent — every payload written before this stage lacked the field entirely. */
  readonly mode: DuetMode;
  /** Wave D, `mode: "atisma"` only. `null` for every other mode, regardless of what the raw payload carried. */
  readonly segments: DuetSegment[] | null;
}

/** Returns `null` (rather than throwing) on a malformed payload so the caller can raise one clear error. */
export function parseMixDuetJobPayload(raw: unknown): MixDuetJobPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const referenceAssetId = record.reference_asset_id;
  const offsetMsRaw = record.offset_ms;
  if (typeof referenceAssetId !== "string" || typeof offsetMsRaw !== "number") {
    return null;
  }

  const preset = typeof record.preset === "string" ? (record.preset as AudioEnhancementPreset) : undefined;
  const advancedEqRaw = record.advanced_eq;
  const advancedEq =
    advancedEqRaw && typeof advancedEqRaw === "object" ? (advancedEqRaw as AdvancedEqPayload) : null;
  const referenceGainDb = typeof record.reference_gain_db === "number" ? record.reference_gain_db : 0;
  const modeRaw = record.mode;
  const mode: DuetMode = modeRaw === "atisma" || modeRaw === "cypher" ? modeRaw : "layer";
  const segments = mode === "atisma" ? parseDuetSegments(record.segments) : null;

  return { preset, referenceAssetId, offsetMs: offsetMsRaw, advancedEq, referenceGainDb, mode, segments };
}

/* ------------------------------------------------------------------------ */
/* Wave D — Duet modes (layer already covered above; atisma + cypher below) */
/* ------------------------------------------------------------------------ */

/** Mirrors `public.duet_mode` (migration 20260905120200). */
export type DuetMode = "layer" | "atisma" | "cypher";

export type DuetSegmentSource = "original" | "contribution";

/** One turn of a call-and-response (`atisma`) Duet — see `waves.segments`. */
export interface DuetSegment {
  readonly source: DuetSegmentSource;
  readonly startMs: number;
  readonly endMs: number;
}

/** Mirrors `MAX_AUDIO_DURATION_MS` (`src/lib/supabase/config.ts`) and the literal in `validate_duet_segments()` (migration 20260905120200) — kept as a local constant so this pure-logic module has no dependency on the Next.js-only config file. */
export const MAX_DUET_SEGMENTS_TOTAL_MS = 30 * 60 * 1000;
/** Sanity ceiling on turn count — mirrors `validate_duet_segments()`'s own `v_count > 40` guard. */
export const MAX_DUET_SEGMENTS = 40;
export const DEFAULT_ATISMA_CROSSFADE_MS = 40;

/** Best-effort parse of a `mix_duet` payload's `segments` field — `null` (not a throw) on anything malformed, since a malformed payload is a worker-time data problem the caller should report, not crash on mid-parse. Real validation is `validateDuetSegments`, run by the caller (Server Action) before the row is ever written. */
function parseDuetSegments(raw: unknown): DuetSegment[] | null {
  if (!Array.isArray(raw)) return null;
  const segments: DuetSegment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const source = record.source;
    const startMs = record.startMs;
    const endMs = record.endMs;
    if ((source !== "original" && source !== "contribution") || typeof startMs !== "number" || typeof endMs !== "number") {
      return null;
    }
    segments.push({ source, startMs, endMs });
  }
  return segments;
}

/**
 * Validate an `atisma` Duet's segment list (spec: "backend validates
 * monotonic, non-overlapping, total <= max"). Mirrors
 * `public.validate_duet_segments` (migration 20260905120200) exactly — kept
 * in sync manually, checked to agree by `ffmpegChain.test.ts`, the same
 * dual-enforcement pattern `src/lib/duet/permissions.ts` documents for
 * `can_request_duet`.
 *
 * Throws a descriptive `Error` on the first violation rather than returning
 * a boolean — both `publishDuetWaveSchema`'s Zod `.refine` (the primary,
 * user-facing check) and `buildAtismaMixFilterComplex` (a worker-time
 * defensive check) want a specific reason, not just pass/fail.
 *
 * "Monotonic and non-overlapping" is checked PER SOURCE, not across the
 * whole array: segments alternate between the original and the contribution
 * by construction, so the invariant that matters is that neither track's own
 * timeline is replayed or reused out of order — not that the array's
 * `startMs` values are globally increasing (they never would be).
 */
export function validateDuetSegments(segments: readonly DuetSegment[]): void {
  // Not `Array.isArray(segments)`: merely calling it anywhere in this
  // function — even assigned to an intermediate boolean rather than tested
  // inline — makes TypeScript treat every later reference to a `readonly T[]`
  // parameter as `any[]` for the rest of the function (a real narrowing
  // quirk, confirmed in isolation; not a stylistic choice). `!segments`
  // still catches `null`/`undefined` from a non-TS caller without it.
  if (!segments || segments.length === 0) {
    throw new Error("An atışma Duet needs at least one segment.");
  }
  if (segments.length > MAX_DUET_SEGMENTS) {
    throw new Error(`An atışma Duet may have at most ${MAX_DUET_SEGMENTS} segments.`);
  }

  const lastEndBySource: Record<DuetSegmentSource, number> = { original: 0, contribution: 0 };
  let totalMs = 0;

  for (const segment of segments) {
    if (
      !Number.isFinite(segment.startMs) ||
      !Number.isFinite(segment.endMs) ||
      segment.startMs < 0 ||
      segment.endMs <= segment.startMs
    ) {
      throw new Error(`Invalid segment bounds: ${JSON.stringify(segment)}.`);
    }
    if (segment.startMs < lastEndBySource[segment.source]) {
      throw new Error(
        `Segments must be monotonic and non-overlapping within each source (overlap on "${segment.source}").`,
      );
    }
    lastEndBySource[segment.source] = segment.endMs;
    totalMs += segment.endMs - segment.startMs;
  }

  if (totalMs > MAX_DUET_SEGMENTS_TOTAL_MS) {
    throw new Error(
      `Atışma Duet segments total ${totalMs}ms, over the ${MAX_DUET_SEGMENTS_TOTAL_MS}ms maximum.`,
    );
  }
}

export interface AtismaMixChainResult {
  /** The complete `-filter_complex` argument. */
  readonly filterComplex: string;
  /** The `-map` argument selecting the spliced output. */
  readonly outputMap: string;
  readonly segmentCount: number;
}

/**
 * Build the `-filter_complex` graph for an `atisma` (call-and-response)
 * Duet mixdown. Expects ffmpeg to be invoked with the original reference as
 * input `0` and the contribution as input `1` — same input order as
 * `buildDuetMixFilterComplex` — so a segment's `source` selects which input
 * its `atrim` reads from.
 *
 * Each segment is trimmed to its own `[startMs, endMs)` window on its
 * source's timeline, then spliced to the previous segment with a short
 * `acrossfade` (default 40ms, spec) rather than a hard cut — pairwise,
 * folding left, matching ffmpeg's standard gapless-crossfade-concatenation
 * recipe. A pair whose crossfade would be longer than either segment is
 * clamped down (floor 5ms) so `acrossfade` never errors on a very short turn.
 *
 * Only `contribution`-sourced segments get the enhancement preset/EQ
 * applied — mirrors `buildDuetMixFilterComplex`'s "enhance the new part
 * only" rule (the `original` segments already carry the creator's own
 * processing from their own Wave).
 *
 * Throws (via `validateDuetSegments`) on an empty list, overlapping/
 * non-monotonic segments, or a total duration over the max — the caller
 * (`runMixDuetJob`, `scripts/worker.ts`) is expected to have already
 * validated at write time; this is the last line of defense before ffmpeg
 * would otherwise be handed a nonsensical or unbounded filter graph.
 */
export function buildAtismaMixFilterComplex(
  segments: readonly DuetSegment[],
  options: { crossfadeMs?: number; presetFilter?: string; advancedEq?: AdvancedEqPayload | null } = {},
): AtismaMixChainResult {
  validateDuetSegments(segments);
  const crossfadeMs = Math.max(0, options.crossfadeMs ?? DEFAULT_ATISMA_CROSSFADE_MS);
  const contributionFilter = options.presetFilter
    ? composeFilterChain(options.presetFilter, buildAdvancedEqFilter(options.advancedEq))
    : null;

  const labels: string[] = [];
  const parts: string[] = [];
  segments.forEach((segment, index) => {
    const inputIndex = segment.source === "original" ? 0 : 1;
    const label = `seg${index}`;
    const startS = (segment.startMs / 1000).toFixed(3);
    const endS = (segment.endMs / 1000).toFixed(3);
    const trim = `atrim=start=${startS}:end=${endS},asetpts=PTS-STARTPTS`;
    const enhance = segment.source === "contribution" && contributionFilter ? `,${contributionFilter}` : "";
    parts.push(`[${inputIndex}:a]${trim}${enhance}[${label}]`);
    labels.push(label);
  });

  if (labels.length === 1) {
    parts.push(`[${labels[0]}]anull[mixed]`);
    return { filterComplex: parts.join(";"), outputMap: "[mixed]", segmentCount: 1 };
  }

  let accLabel = labels[0];
  for (let i = 1; i < labels.length; i++) {
    const segADurationMs = segments[i - 1].endMs - segments[i - 1].startMs;
    const segBDurationMs = segments[i].endMs - segments[i].startMs;
    const pairCrossfadeMs = Math.max(5, Math.min(crossfadeMs, segADurationMs, segBDurationMs));
    const outLabel = i === labels.length - 1 ? "mixed" : `xf${i}`;
    parts.push(
      `[${accLabel}][${labels[i]}]acrossfade=d=${(pairCrossfadeMs / 1000).toFixed(3)}:c1=tri:c2=tri[${outLabel}]`,
    );
    accLabel = outLabel;
  }

  return { filterComplex: parts.join(";"), outputMap: "[mixed]", segmentCount: labels.length };
}

export interface CypherMixChainResult {
  readonly filterComplex: string;
  readonly outputMap: string;
}

/**
 * Build the `-filter_complex` graph for a `cypher` (sequential verses) Duet
 * mixdown. Expects input `0` = the parent's full rendered audio so far (every
 * earlier verse already concatenated into it — nothing here re-renders
 * history) and input `1` = this Duet's new contribution. The enhancement
 * preset/EQ is applied to the contribution alone, exactly like
 * `buildDuetMixFilterComplex`'s "layer" mode — the parent's audio already
 * carries its own chain of prior processing.
 *
 * `concat=n=2:v=0:a=1` appends the (enhanced) contribution immediately after
 * the parent — no crossfade, unlike `atisma`: a cypher verse starts clean,
 * the way a rap cypher's next verse does.
 */
export function buildCypherMixFilterComplex(options: {
  presetFilter: string;
  advancedEq?: AdvancedEqPayload | null;
}): CypherMixChainResult {
  const advancedEqFilter = buildAdvancedEqFilter(options.advancedEq);
  const contributionFilters = [options.presetFilter, advancedEqFilter]
    .filter((step): step is string => Boolean(step))
    .join(",");

  const filterComplex =
    `[1:a]${contributionFilters}[contrib];` + `[0:a][contrib]concat=n=2:v=0:a=1[mixed]`;

  return { filterComplex, outputMap: "[mixed]" };
}
