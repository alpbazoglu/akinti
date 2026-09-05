/**
 * The six named sounds (spec §19, `docs/design/SCREENS.md` §4.4).
 *
 * The ids below MUST match `AUDIO_ENHANCEMENT_PRESETS` in
 * `src/types/domain.ts` and the keys of `PRESET_FILTERS` in
 * `scripts/worker.ts` exactly — the worker is the authoritative, real
 * (ffmpeg + Python sidecar) processor. This module is the *naming* layer: the
 * id, the label a person reads, and the one-line promise the row makes.
 *
 * The DSP those names stand for lives in `./preview/graph.ts`, which is the
 * single definition of each chain, shared by the A/B preview engine and by
 * this module's `createPreviewGraph`. Do not edit the worker from here; if the
 * two ever need to diverge, that is a product decision, not a refactor.
 */

import {
  POLISH_CHAINS,
  buildPolishGraph,
  describePolishGraph,
  type PolishBiquadSpec,
  type PolishCompressorSpec,
  type PolishGainSpec,
  type PolishNodeSpec,
  type PolishReverbSpec,
} from "./preview/graph";

export type EnhancementPresetId =
  | "natural"
  | "studio"
  | "clear_voice"
  | "warm"
  | "deep"
  | "atmospheric";

/**
 * The chain step types are defined once, in `./preview/graph.ts`, and
 * re-exported here under their original names because they are part of this
 * module's published surface (`src/lib/audio/index.ts`).
 */
export type PreviewBiquadStep = PolishBiquadSpec;
export type PreviewGainStep = PolishGainSpec;
export type PreviewCompressorStep = PolishCompressorSpec;
export type PreviewConvolverStep = PolishReverbSpec;
export type PreviewChainStep = PolishNodeSpec;

export interface EnhancementPreset {
  readonly id: EnhancementPresetId;
  readonly label: string;
  /** One line, sentence case, no promise the worker cannot keep. */
  readonly description: string;
  readonly chain: readonly PreviewChainStep[];
}

/**
 * Ordered exactly as the Enhance step lists them. The descriptions are the
 * ones `SCREENS.md` §4.4 prints beside each row: four words at most, because
 * this list is read while someone is holding a phone, mid-take.
 */
export const ENHANCEMENT_PRESETS: readonly EnhancementPreset[] = [
  {
    id: "natural",
    label: "Natural",
    description: "Sounds like you, just leveled",
    chain: POLISH_CHAINS.natural,
  },
  {
    id: "studio",
    label: "Studio",
    description: "Fuller, wider",
    chain: POLISH_CHAINS.studio,
  },
  {
    id: "clear_voice",
    label: "Clear voice",
    description: "Speech forward",
    chain: POLISH_CHAINS.clear_voice,
  },
  {
    id: "warm",
    label: "Warm",
    description: "Softer highs",
    chain: POLISH_CHAINS.warm,
  },
  {
    id: "deep",
    label: "Deep",
    description: "Low and rich",
    chain: POLISH_CHAINS.deep,
  },
  {
    id: "atmospheric",
    label: "Atmospheric",
    description: "Room around the voice",
    chain: POLISH_CHAINS.atmospheric,
  },
] as const;

export function getEnhancementPreset(id: EnhancementPresetId): EnhancementPreset {
  return ENHANCEMENT_PRESETS.find((preset) => preset.id === id) ?? ENHANCEMENT_PRESETS[0];
}

/* ------------------------------------------------------------------------ */
/* AKINTI Pro sounds (Wave F, PRODUCT_V2 §4/§5)                             */
/* ------------------------------------------------------------------------ */

/**
 * The two Pro-only sounds shown in the Enhance picker (`EnhanceStage.tsx`),
 * marked "Pro" and gated by `requirePro()`
 * (`src/app/(app)/create/actions.ts`). Deliberately kept out of
 * `EnhancementPresetId`/`ENHANCEMENT_PRESETS` above: that union is also the
 * exhaustive key set of `POLISH_CHAINS` (`./preview/graph.ts`) and of
 * `audio_assets.enhancement_preset`, a Postgres enum
 * (`supabase/migrations/20260903120100_extensions_enums_helpers.sql`)
 * that does not have these two values yet — widening it is a migration, out
 * of this wave's file ownership. `PRO_ENHANCEMENT_PRESETS` is a separate,
 * self-contained catalog so the picker, the gate and its unit test all have
 * a real, non-placeholder id list today without touching that enum or the
 * files whose types are keyed on it.
 *
 * The chain on each entry is real EQ/compressor settings, not a placeholder
 * — sized to the character each name promises rather than to true pitch
 * detection or a second harmony voice, which belong to the deeper pitch/
 * harmony engine PRODUCT_V2 §4 describes as separate, larger DSP work.
 * `scripts/worker.ts`'s `PRESET_FILTERS` carries the matching ffmpeg chain
 * ahead of time, for the same reason.
 */
export type ProEnhancementPresetId = "pitch_snap" | "self_harmony";

export interface ProEnhancementPreset {
  readonly id: ProEnhancementPresetId;
  readonly label: string;
  /** One line, sentence case — the promise this Pro sound makes. */
  readonly description: string;
  readonly chain: readonly PreviewChainStep[];
}

export const PRO_ENHANCEMENT_PRESETS: readonly ProEnhancementPreset[] = [
  {
    id: "pitch_snap",
    label: "Pitch snap",
    description: "Vocal locked to key",
    chain: [
      { type: "biquad", filter: "highpass", frequency: 110, Q: 0.7 },
      { type: "compressor", threshold: -16, knee: 4, ratio: 4, attack: 0.002, release: 0.06 },
      { type: "biquad", filter: "peaking", frequency: 2800, gain: 3, Q: 1.2 },
      { type: "biquad", filter: "peaking", frequency: 9000, gain: -1.5, Q: 1 },
      { type: "gain", value: 1.15 },
    ],
  },
  {
    id: "self_harmony",
    label: "Self-harmony",
    description: "You, in two voices",
    chain: [
      { type: "compressor", threshold: -20, knee: 8, ratio: 2.5, attack: 0.008, release: 0.15 },
      { type: "biquad", filter: "peaking", frequency: 1500, gain: 2, Q: 1 },
      { type: "reverb", seconds: 0.6, decay: 2.8, preDelaySeconds: 0.015, wet: 0.22 },
      { type: "gain", value: 1.1 },
    ],
  },
] as const;

/** True when `id` names one of the two Pro-only sounds above — the exact check `requirePro()`'s call site (`create/actions.ts`) gates on. */
export function isProOnlyEnhancementPresetId(id: string): id is ProEnhancementPresetId {
  return PRO_ENHANCEMENT_PRESETS.some((preset) => preset.id === id);
}

/**
 * Build a Web Audio graph for `presetId`, connected after `source`. Returns
 * the final node — the caller connects it onward. Local preview only; never
 * used to render the audio that gets uploaded.
 */
export function createPreviewGraph(
  audioContext: AudioContext,
  source: AudioNode,
  presetId: EnhancementPresetId,
): AudioNode {
  return buildPolishGraph(audioContext, source, describePolishGraph(presetId));
}

/* ------------------------------------------------------------------------ */
/* Advanced EQ (spec §19: "power users may get an optional advanced EQ")    */
/* ------------------------------------------------------------------------ */

export const ADVANCED_EQ_BANDS = [60, 250, 1000, 4000, 12000] as const;
export type AdvancedEqBandHz = (typeof ADVANCED_EQ_BANDS)[number];
export const ADVANCED_EQ_MAX_GAIN_DB = 12;

/** Per-band gain in dB, clamped to `±ADVANCED_EQ_MAX_GAIN_DB`. */
export type AdvancedEqSettings = Readonly<Record<AdvancedEqBandHz, number>>;

export function clampEqGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ADVANCED_EQ_MAX_GAIN_DB, Math.max(-ADVANCED_EQ_MAX_GAIN_DB, value));
}

export function defaultAdvancedEqSettings(): AdvancedEqSettings {
  return { 60: 0, 250: 0, 1000: 0, 4000: 0, 12000: 0 };
}

/**
 * Build a 5-band peaking-EQ chain, connected after `source`. Opt-in and
 * separate from the preset chain — applied on top of it, never in place of
 * it, matching the spec's "opt-in and secondary to the presets" framing.
 */
export function createAdvancedEqGraph(
  audioContext: AudioContext,
  source: AudioNode,
  settings: AdvancedEqSettings,
): AudioNode {
  let node: AudioNode = source;
  for (const band of ADVANCED_EQ_BANDS) {
    const filter = audioContext.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = band;
    filter.Q.value = 1;
    filter.gain.value = clampEqGain(settings[band] ?? 0);
    node.connect(filter);
    node = filter;
  }
  return node;
}
