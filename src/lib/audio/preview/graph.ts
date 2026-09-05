/**
 * The polish preview graph: what "Sounds like: Studio" actually does to your
 * voice while you are standing there listening to it
 * (`docs/PRODUCT_V2.md` §3 step 3, `docs/research/libraries.md` §3).
 *
 * Native Web Audio nodes only — `DynamicsCompressorNode`, `BiquadFilterNode`
 * and a `ConvolverNode` fed by a procedurally generated impulse
 * (`./impulse.ts`). No library, no downloaded impulse files, no client-side
 * autotune: libraries.md is explicit that a preset preview needs nothing more
 * than what every browser already ships, and that real correction belongs on
 * the server.
 *
 * **This is a preview, never the product.** `scripts/worker.ts` renders the
 * published file with ffmpeg (`PRESET_FILTERS`) and the Python sidecar; these
 * chains are hand-tuned to *sound like* those filter chains so the choice a
 * user makes here is the choice they get back, but nothing built here is ever
 * uploaded.
 *
 * The chains are **data**. `describePolishGraph` returns the node list without
 * touching an `AudioContext`, which is what makes "Studio has a compressor and
 * a room, Natural does not" a unit test rather than a listening session.
 */

import type { AdvancedEqSettings, EnhancementPresetId } from "../enhancement";

import { createRoomImpulse } from "./impulse";

export interface PolishGainSpec {
  readonly type: "gain";
  readonly value: number;
}

export interface PolishBiquadSpec {
  readonly type: "biquad";
  readonly filter: BiquadFilterType;
  readonly frequency: number;
  readonly gain?: number;
  readonly Q?: number;
}

/** Approximates ffmpeg's `acompressor`, plus the leveling `loudnorm` gives. */
export interface PolishCompressorSpec {
  readonly type: "compressor";
  /** dBFS. */
  readonly threshold: number;
  /** dB of soft knee. */
  readonly knee: number;
  readonly ratio: number;
  /** Seconds. */
  readonly attack: number;
  /** Seconds. */
  readonly release: number;
}

/** A wet/dry reverb built around one `ConvolverNode` (`./impulse.ts`). */
export interface PolishReverbSpec {
  readonly type: "reverb";
  readonly seconds: number;
  readonly decay: number;
  readonly preDelaySeconds: number;
  /** Wet share, `0..1`. A convolver in series with no dry path is unusable. */
  readonly wet: number;
}

export type PolishNodeSpec =
  | PolishGainSpec
  | PolishBiquadSpec
  | PolishCompressorSpec
  | PolishReverbSpec;

/**
 * One chain per preset id. The ids are the contract with
 * `AUDIO_ENHANCEMENT_PRESETS` (`src/types/domain.ts`) and `PRESET_FILTERS`
 * (`scripts/worker.ts`); changing one without the others is a product
 * decision, not a refactor.
 *
 * Notes on the tuning, against the worker's own filters:
 *
 * - `natural` is `loudnorm` alone on the server, so here it is one gentle,
 *   wide-knee compressor and a little makeup gain: audibly steadier, still
 *   recognisably the room you recorded in. It is a light touch, not a bypass,
 *   because a default that does nothing is not a default worth having.
 * - `studio` mirrors `afftdn + acompressor + loudnorm`: a high-pass where the
 *   denoiser would have cleaned up rumble, a real compressor, a presence lift,
 *   and a short bright room for the "fuller, wider" the screen promises.
 * - `clear_voice`, `warm` and `deep` are the worker's EQ moves verbatim, each
 *   with the leveling compressor in front so the preset difference is the EQ
 *   and not the loudness.
 * - `atmospheric` is `aecho` on the server; a 1.6s tail with 20ms of pre-delay
 *   is the closest a convolver gets to it without sounding like a canyon.
 */
export const POLISH_CHAINS: Readonly<Record<EnhancementPresetId, readonly PolishNodeSpec[]>> = {
  natural: [
    { type: "compressor", threshold: -24, knee: 12, ratio: 2, attack: 0.01, release: 0.25 },
    { type: "gain", value: 1.15 },
  ],
  studio: [
    { type: "biquad", filter: "highpass", frequency: 90, Q: 0.7 },
    { type: "compressor", threshold: -18, knee: 8, ratio: 3, attack: 0.005, release: 0.05 },
    { type: "biquad", filter: "peaking", frequency: 2500, gain: 2, Q: 1 },
    { type: "reverb", seconds: 0.45, decay: 3.4, preDelaySeconds: 0.008, wet: 0.12 },
    { type: "gain", value: 1.2 },
  ],
  clear_voice: [
    { type: "biquad", filter: "highpass", frequency: 100, Q: 0.7 },
    { type: "compressor", threshold: -20, knee: 6, ratio: 3.5, attack: 0.004, release: 0.08 },
    { type: "biquad", filter: "peaking", frequency: 3000, gain: 4, Q: 1 },
    { type: "gain", value: 1.15 },
  ],
  warm: [
    { type: "compressor", threshold: -22, knee: 10, ratio: 2.5, attack: 0.01, release: 0.2 },
    { type: "biquad", filter: "peaking", frequency: 200, gain: 3, Q: 1 },
    { type: "biquad", filter: "highshelf", frequency: 8000, gain: -2 },
    { type: "gain", value: 1.15 },
  ],
  deep: [
    { type: "compressor", threshold: -22, knee: 10, ratio: 2.5, attack: 0.01, release: 0.2 },
    { type: "biquad", filter: "peaking", frequency: 100, gain: 6, Q: 1 },
    { type: "biquad", filter: "lowpass", frequency: 12000 },
    { type: "gain", value: 1.1 },
  ],
  atmospheric: [
    { type: "compressor", threshold: -22, knee: 10, ratio: 2.5, attack: 0.01, release: 0.2 },
    { type: "reverb", seconds: 1.6, decay: 2.4, preDelaySeconds: 0.02, wet: 0.32 },
    { type: "gain", value: 1.05 },
  ],
} as const;

/** The five advanced bands, in the order they are chained. */
export const ADVANCED_EQ_BAND_ORDER: readonly number[] = [60, 250, 1000, 4000, 12000];

/**
 * The complete node list for a preset, with the optional advanced EQ appended
 * *after* it — on top of the preset, never instead of it.
 *
 * Bands sitting at 0 dB are omitted: a peaking filter with no gain is an
 * audibly transparent node that still costs a graph edge, and leaving it out
 * makes "did the user actually change anything" answerable by looking at the
 * spec.
 */
export function describePolishGraph(
  presetId: EnhancementPresetId,
  advancedEq?: AdvancedEqSettings | null,
): readonly PolishNodeSpec[] {
  const base = POLISH_CHAINS[presetId] ?? POLISH_CHAINS.natural;
  if (!advancedEq) return base;

  const bands: PolishNodeSpec[] = [];
  for (const frequency of ADVANCED_EQ_BAND_ORDER) {
    const gain = advancedEq[frequency as keyof AdvancedEqSettings] ?? 0;
    if (gain === 0) continue;
    bands.push({ type: "biquad", filter: "peaking", frequency, gain, Q: 1 });
  }

  return bands.length > 0 ? [...base, ...bands] : base;
}

/**
 * Realise a spec list as live nodes, connected in series after `source`, and
 * return the last node. The caller connects it onward — this function never
 * touches `destination`, so the same builder serves the A/B preview and any
 * future offline render.
 */
export function buildPolishGraph(
  context: AudioContext,
  source: AudioNode,
  specs: readonly PolishNodeSpec[],
): AudioNode {
  let node: AudioNode = source;

  for (const spec of specs) {
    switch (spec.type) {
      case "gain": {
        const gain = context.createGain();
        gain.gain.value = spec.value;
        node.connect(gain);
        node = gain;
        break;
      }
      case "biquad": {
        const biquad = context.createBiquadFilter();
        biquad.type = spec.filter;
        biquad.frequency.value = spec.frequency;
        if (typeof spec.gain === "number") biquad.gain.value = spec.gain;
        if (typeof spec.Q === "number") biquad.Q.value = spec.Q;
        node.connect(biquad);
        node = biquad;
        break;
      }
      case "compressor": {
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = spec.threshold;
        compressor.knee.value = spec.knee;
        compressor.ratio.value = spec.ratio;
        compressor.attack.value = spec.attack;
        compressor.release.value = spec.release;
        node.connect(compressor);
        node = compressor;
        break;
      }
      case "reverb": {
        node = connectReverb(context, node, spec);
        break;
      }
    }
  }

  return node;
}

/**
 * `input -> dry -> merge` and `input -> convolver -> wet -> merge`.
 *
 * The dry path is the point: a `ConvolverNode` in series is 100% wet, which
 * is a voice in a cave, not a voice in a room.
 */
function connectReverb(
  context: AudioContext,
  input: AudioNode,
  spec: PolishReverbSpec,
): AudioNode {
  const merge = context.createGain();
  merge.gain.value = 1;

  const dry = context.createGain();
  dry.gain.value = 1 - spec.wet;
  input.connect(dry);
  dry.connect(merge);

  const convolver = context.createConvolver();
  convolver.normalize = true;
  convolver.buffer = createRoomImpulse(context, {
    seconds: spec.seconds,
    decay: spec.decay,
    preDelaySeconds: spec.preDelaySeconds,
  });

  const wet = context.createGain();
  wet.gain.value = spec.wet;
  input.connect(convolver);
  convolver.connect(wet);
  wet.connect(merge);

  return merge;
}
