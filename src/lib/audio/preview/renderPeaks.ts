"use client";

/**
 * Render the polished take offline, so the A/B toggle on the Enhance step can
 * redraw a **real** trace rather than a decorated one.
 *
 * `docs/design/DESIGN.md` §6.3 allows exactly one animated redraw of the
 * waterline — the 180ms A/B morph — "because there the change *is* the
 * content". That only holds if the second trace is genuinely the processed
 * audio; a waveform that was nudged to look different would be the fake
 * waveform §12.32 forbids, dressed up as a feature.
 *
 * So the chain from `./graph.ts` is run through an `OfflineAudioContext`,
 * faster than realtime, and the result bucketed the same way `decodeToPeaks`
 * buckets the original. Two constraints keep it honest:
 *
 * - **Length.** Above `MAX_RENDER_SECONDS` this returns `null` and the screen
 *   keeps drawing the original trace. A phone rendering five minutes of audio
 *   to answer a visual question is the wrong trade.
 * - **Failure.** Any decode or render failure also returns `null`. The trace
 *   staying put is the honest outcome; there is nothing to invent.
 */

import type { AdvancedEqSettings, EnhancementPresetId } from "../enhancement";

import { buildPolishGraph, describePolishGraph } from "./graph";

/** Above this the offline render is not worth what it costs on a phone. */
export const MAX_RENDER_SECONDS = 120;

function getOfflineCtor(): typeof OfflineAudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.OfflineAudioContext ??
    (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext ??
    null
  );
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

function bucketPeaks(channel: Float32Array, buckets: number): number[] {
  if (buckets <= 0 || channel.length === 0) return [];
  const perBucket = Math.max(1, Math.floor(channel.length / buckets));
  const peaks: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * perBucket;
    const end = bucket === buckets - 1 ? channel.length : Math.min(start + perBucket, channel.length);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const value = Math.abs(channel[i]);
      if (value > peak) peak = value;
    }
    peaks.push(Math.min(1, peak));
  }
  return peaks;
}

/**
 * The polished trace, or `null` when it cannot honestly be produced.
 *
 * `decoded` is passed in rather than decoded here so the caller can decode
 * once and render several presets from the same buffer.
 */
export async function renderPolishedPeaks(
  decoded: AudioBuffer,
  presetId: EnhancementPresetId,
  advancedEq: AdvancedEqSettings | null,
  buckets: number,
): Promise<number[] | null> {
  if (decoded.duration > MAX_RENDER_SECONDS) return null;

  const Ctor = getOfflineCtor();
  if (!Ctor) return null;

  try {
    const offline = new Ctor(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;

    const end = buildPolishGraph(
      offline as unknown as AudioContext,
      source,
      describePolishGraph(presetId, advancedEq),
    );
    end.connect(offline.destination);
    source.start(0);

    const rendered = await offline.startRendering();
    return bucketPeaks(rendered.getChannelData(0), buckets);
  } catch {
    return null;
  }
}

/** Decode a captured take once, for repeated offline renders. */
export async function decodeTake(blob: Blob): Promise<AudioBuffer | null> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  const context = new Ctor();
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  } finally {
    try {
      await context.close();
    } catch {
      // Already closed.
    }
  }
}
