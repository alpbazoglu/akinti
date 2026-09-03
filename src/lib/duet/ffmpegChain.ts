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

  const advancedEqFilter = buildAdvancedEqFilter(options.advancedEq);
  const contributionFilters = [
    `adelay=${contributionDelayMs}:all=1`,
    options.presetFilter,
    advancedEqFilter,
  ]
    .filter((step): step is string => Boolean(step))
    .join(",");

  const filterComplex =
    `[1:a]${contributionFilters}[contrib];` +
    `[0:a]adelay=${referenceDelayMs}:all=1[ref];` +
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

  return { preset, referenceAssetId, offsetMs: offsetMsRaw, advancedEq };
}
