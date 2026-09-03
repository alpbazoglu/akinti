/**
 * Enhancement presets (spec section 19) — client preview only.
 *
 * The six preset ids below MUST match `AUDIO_ENHANCEMENT_PRESETS` in
 * `src/types/domain.ts` and the keys of `PRESET_FILTERS` in
 * `scripts/worker.ts` exactly — the worker is the authoritative, real
 * (ffmpeg-based) processor; this module only builds a lightweight Web Audio
 * graph so a user can preview roughly what a preset will sound like before
 * publishing. Do not edit the worker from here; if the two ever need to
 * diverge, that is a product decision, not a refactor.
 */

export type EnhancementPresetId =
  | "natural"
  | "studio"
  | "clear_voice"
  | "warm"
  | "deep"
  | "atmospheric";

export interface PreviewBiquadStep {
  readonly type: "biquad";
  readonly filter: BiquadFilterType;
  readonly frequency: number;
  readonly gain?: number;
  readonly Q?: number;
}

export interface PreviewGainStep {
  readonly type: "gain";
  readonly value: number;
}

/** A short, generated impulse response standing in for `aecho` (spec §19 "atmospheric"). */
export interface PreviewConvolverStep {
  readonly type: "convolver-light";
}

export type PreviewChainStep = PreviewBiquadStep | PreviewGainStep | PreviewConvolverStep;

export interface EnhancementPreset {
  readonly id: EnhancementPresetId;
  readonly label: string;
  readonly description: string;
  readonly chain: readonly PreviewChainStep[];
}

/**
 * Ordered to match the display order used everywhere else presets are
 * listed. Chains are deliberately simple — a rough client preview, not a
 * faithful reproduction of the worker's ffmpeg filter graph.
 */
export const ENHANCEMENT_PRESETS: readonly EnhancementPreset[] = [
  {
    id: "natural",
    label: "Natural",
    description: "Light cleanup only — sounds like you, just leveled.",
    chain: [{ type: "gain", value: 1 }],
  },
  {
    id: "studio",
    label: "Studio",
    description: "Noise reduction and gentle compression for a polished take.",
    chain: [
      { type: "biquad", filter: "highpass", frequency: 90, Q: 0.7 },
      { type: "biquad", filter: "peaking", frequency: 2500, gain: 2, Q: 1 },
      { type: "gain", value: 1.05 },
    ],
  },
  {
    id: "clear_voice",
    label: "Clear Voice",
    description: "Cuts low rumble and lifts presence so speech cuts through.",
    chain: [
      { type: "biquad", filter: "highpass", frequency: 100, Q: 0.7 },
      { type: "biquad", filter: "peaking", frequency: 3000, gain: 4, Q: 1 },
    ],
  },
  {
    id: "warm",
    label: "Warm",
    description: "Rounds out the low-mids and softens the very top end.",
    chain: [
      { type: "biquad", filter: "peaking", frequency: 200, gain: 3, Q: 1 },
      { type: "biquad", filter: "highshelf", frequency: 8000, gain: -2 },
    ],
  },
  {
    id: "deep",
    label: "Deep",
    description: "Boosts bass and rolls off the highs for a low, rich tone.",
    chain: [
      { type: "biquad", filter: "peaking", frequency: 100, gain: 6, Q: 1 },
      { type: "biquad", filter: "lowpass", frequency: 12000 },
    ],
  },
  {
    id: "atmospheric",
    label: "Atmospheric",
    description: "Adds light space and echo around the voice.",
    chain: [{ type: "convolver-light" }, { type: "gain", value: 0.9 }],
  },
] as const;

export function getEnhancementPreset(id: EnhancementPresetId): EnhancementPreset {
  return ENHANCEMENT_PRESETS.find((preset) => preset.id === id) ?? ENHANCEMENT_PRESETS[0];
}

/** A short synthetic impulse response — a stand-in reverb tail, not a sampled space. */
function buildLightImpulseResponse(
  audioContext: AudioContext,
  durationSeconds = 0.5,
  decay = 3.2,
): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return impulse;
}

/**
 * Build a Web Audio graph for `presetId`, connected after `source`. Returns
 * the final node — the caller connects it onward (to `audioContext.destination`
 * or another node). Local preview only; never used to render the audio that
 * gets uploaded.
 */
export function createPreviewGraph(
  audioContext: AudioContext,
  source: AudioNode,
  presetId: EnhancementPresetId,
): AudioNode {
  const preset = getEnhancementPreset(presetId);
  let node: AudioNode = source;

  for (const step of preset.chain) {
    if (step.type === "biquad") {
      const biquad = audioContext.createBiquadFilter();
      biquad.type = step.filter;
      biquad.frequency.value = step.frequency;
      if (typeof step.gain === "number") biquad.gain.value = step.gain;
      if (typeof step.Q === "number") biquad.Q.value = step.Q;
      node.connect(biquad);
      node = biquad;
    } else if (step.type === "gain") {
      const gain = audioContext.createGain();
      gain.gain.value = step.value;
      node.connect(gain);
      node = gain;
    } else {
      const convolver = audioContext.createConvolver();
      convolver.buffer = buildLightImpulseResponse(audioContext);
      convolver.normalize = true;
      node.connect(convolver);
      node = convolver;
    }
  }

  return node;
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
