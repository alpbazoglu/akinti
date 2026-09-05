import { describe, expect, it } from "vitest";

import { AUDIO_ENHANCEMENT_PRESETS } from "@/types/domain";

import {
  ADVANCED_EQ_BANDS,
  ADVANCED_EQ_MAX_GAIN_DB,
  ENHANCEMENT_PRESETS,
  clampEqGain,
  createAdvancedEqGraph,
  createPreviewGraph,
  defaultAdvancedEqSettings,
  getEnhancementPreset,
} from "./enhancement";

/**
 * `scripts/worker.ts` is the authoritative preset processor (real ffmpeg
 * filter chains, in `PRESET_FILTERS`). It is a standalone Node script that
 * constructs a Supabase admin client at import time, so it is not imported
 * directly here — its preset ids are mirrored below and must be kept in sync
 * by hand whenever either side changes.
 */
const WORKER_PRESET_IDS = ["natural", "studio", "clear_voice", "warm", "deep", "atmospheric"];

/** Minimal fake Web Audio graph — jsdom does not implement the real one. */
function createFakeAudioContext() {
  const connections: { from: string; to: string }[] = [];
  let counter = 0;

  function makeNode(kind: string) {
    const id = `${kind}-${(counter += 1)}`;
    return {
      id,
      kind,
      frequency: { value: 0 },
      gain: { value: 0 },
      Q: { value: 0 },
      buffer: null as unknown,
      normalize: false,
      connect(target: { id: string }) {
        connections.push({ from: id, to: target.id });
      },
    };
  }

  function makeParamNode(kind: string) {
    const node = makeNode(kind);
    return Object.assign(node, {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    });
  }

  const audioContext = {
    sampleRate: 44100,
    createBiquadFilter: () => makeNode("biquad"),
    createGain: () => makeNode("gain"),
    createConvolver: () => makeNode("convolver"),
    createDynamicsCompressor: () => makeParamNode("compressor"),
    createBuffer: (channels: number, length: number) => ({
      numberOfChannels: channels,
      getChannelData: () => new Float32Array(length),
    }),
  };

  return { audioContext, connections, makeNode };
}

describe("ENHANCEMENT_PRESETS", () => {
  it("has exactly six presets, ids matching the domain enum and the worker", () => {
    const ids = ENHANCEMENT_PRESETS.map((preset) => preset.id);
    expect(ids).toHaveLength(6);
    expect(ids).toEqual([...AUDIO_ENHANCEMENT_PRESETS]);
    expect(ids).toEqual(WORKER_PRESET_IDS);
  });

  it("gives every preset a non-empty label, description and preview chain", () => {
    for (const preset of ENHANCEMENT_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.chain.length).toBeGreaterThan(0);
    }
  });

  it("getEnhancementPreset looks up by id and falls back to the first preset", () => {
    expect(getEnhancementPreset("deep").id).toBe("deep");
    const fallback = getEnhancementPreset(
      // @ts-expect-error deliberately invalid id, to exercise the runtime fallback
      "not-a-real-preset",
    );
    expect(fallback.id).toBe(ENHANCEMENT_PRESETS[0].id);
  });
});

describe("createPreviewGraph", () => {
  it("connects a chain from the source to a distinct output node", () => {
    const { audioContext, connections, makeNode } = createFakeAudioContext();
    const source = makeNode("source");

    const end = createPreviewGraph(audioContext as unknown as AudioContext, source as unknown as AudioNode, "studio");

    expect(end).not.toBe(source);
    expect(connections.length).toBeGreaterThan(0);
    expect(connections[0].from).toBe(source.id);
  });

  it("levels the default preset rather than bypassing it", () => {
    // `natural` is `loudnorm` alone on the server, so the preview is one
    // gentle compressor plus makeup gain: a default that does nothing is not
    // a default worth having (docs/PRODUCT_V2.md section 3).
    const { audioContext, connections, makeNode } = createFakeAudioContext();
    const source = makeNode("source");

    createPreviewGraph(audioContext as unknown as AudioContext, source as unknown as AudioNode, "natural");

    expect(connections).toHaveLength(2);
    expect(connections.some((edge) => edge.to.startsWith("compressor"))).toBe(true);
    expect(connections.some((edge) => edge.to.startsWith("gain"))).toBe(true);
  });

  it("keeps natural the shortest chain of the six", () => {
    const lengths = ENHANCEMENT_PRESETS.map((preset) => preset.chain.length);
    const natural = getEnhancementPreset("natural").chain.length;
    expect(natural).toBe(Math.min(...lengths));
  });

  it("builds a convolver-based chain for atmospheric", () => {
    const { audioContext, connections, makeNode } = createFakeAudioContext();
    const source = makeNode("source");

    createPreviewGraph(audioContext as unknown as AudioContext, source as unknown as AudioNode, "atmospheric");

    expect(connections.some((edge) => edge.to.startsWith("convolver"))).toBe(true);
  });
});

describe("advanced EQ", () => {
  it("has exactly the five spec bands (60/250/1000/4000/12000 Hz)", () => {
    expect(ADVANCED_EQ_BANDS).toEqual([60, 250, 1000, 4000, 12000]);
  });

  it("clamps gain to +/-12 dB and treats non-finite input as 0", () => {
    expect(clampEqGain(20)).toBe(ADVANCED_EQ_MAX_GAIN_DB);
    expect(clampEqGain(-20)).toBe(-ADVANCED_EQ_MAX_GAIN_DB);
    expect(clampEqGain(4.5)).toBe(4.5);
    expect(clampEqGain(Number.NaN)).toBe(0);
  });

  it("defaults every band to 0 dB", () => {
    const settings = defaultAdvancedEqSettings();
    for (const band of ADVANCED_EQ_BANDS) {
      expect(settings[band]).toBe(0);
    }
  });

  it("builds a 5-node chain, one peaking filter per band", () => {
    const { audioContext, connections, makeNode } = createFakeAudioContext();
    const source = makeNode("source");

    createAdvancedEqGraph(audioContext as unknown as AudioContext, source as unknown as AudioNode, {
      60: 3,
      250: 0,
      1000: -2,
      4000: 0,
      12000: 5,
    });

    expect(connections).toHaveLength(5);
    expect(connections.every((edge) => edge.to.startsWith("biquad"))).toBe(true);
  });
});
