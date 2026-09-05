/**
 * Client-side glue for an atışma (call-and-response) Duet contribution:
 * `AtismaTurnRecorder.tsx` captures one short take per turn (via `RecordStage`,
 * unmodified, remounted once per turn) and this file concatenates them into a
 * single take before it goes through the ordinary Review/Enhance/publish path
 * every other Duet mode already uses.
 *
 * Not a `src/lib/audio/**` addition on purpose — this stage does not own that
 * directory, and concatenating N short reply takes into one is specific to
 * this one recorder, not a general audio utility the rest of the app needs.
 * `encodeWavBlob`/`WAV_MIME` themselves ARE reused from `@/lib/audio` (the
 * same writer `applyTrim` already uses for a trimmed take), so the produced
 * blob goes through the ordinary WAV upload path with nothing special about
 * it, exactly like a trimmed recording does.
 */

import { encodeWavBlob, WAV_MIME } from "@/lib/audio";

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    throw new Error("The Web Audio API is not available in this browser.");
  }
  const context = new Ctor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await context.decodeAudioData(arrayBuffer);
  } finally {
    try {
      await context.close();
    } catch {
      // Already closed — nothing to clean up.
    }
  }
}

export interface AtismaTurnTake {
  readonly blob: Blob;
  /** Wall-clock duration as reported by the recorder — the timeline this take is scheduled on below, not `buffer.length` after resampling. */
  readonly durationMs: number;
}

export interface ConcatenatedTake {
  readonly blob: Blob;
  readonly durationMs: number;
  /** Cumulative `{ startMs, endMs }` for each input take, on the concatenated take's own timeline. */
  readonly ranges: readonly { startMs: number; endMs: number }[];
}

/**
 * Decode every turn's reply take, lay them end to end on one mono timeline at
 * the first take's sample rate, and re-encode as a single WAV `Blob`.
 * `OfflineAudioContext` resamples each source node to the context's rate
 * automatically, so takes recorded at different sample rates (rare within one
 * browser session, but not impossible across a countdown/retake) still line
 * up correctly.
 */
export async function concatenateAtismaTurns(takes: readonly AtismaTurnTake[]): Promise<ConcatenatedTake> {
  if (takes.length === 0) {
    throw new Error("No turns were recorded.");
  }

  const buffers = await Promise.all(takes.map((take) => decodeBlob(take.blob)));
  const sampleRate = buffers[0]!.sampleRate;

  const ranges: { startMs: number; endMs: number }[] = [];
  let cursorMs = 0;
  for (const take of takes) {
    const startMs = Math.round(cursorMs);
    const endMs = Math.round(cursorMs + take.durationMs);
    ranges.push({ startMs, endMs });
    cursorMs = endMs;
  }
  const totalDurationMs = cursorMs;
  const totalFrames = Math.max(1, Math.round((totalDurationMs / 1000) * sampleRate));

  const OfflineCtor =
    typeof window === "undefined"
      ? null
      : (window.OfflineAudioContext ??
        (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
          .webkitOfflineAudioContext ??
        null);
  if (!OfflineCtor) {
    throw new Error("Offline audio rendering is not available in this browser.");
  }

  const offlineContext = new OfflineCtor(1, totalFrames, sampleRate);
  buffers.forEach((buffer, index) => {
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start(ranges[index]!.startMs / 1000);
  });

  const rendered = await offlineContext.startRendering();
  const blob = encodeWavBlob(rendered);

  return { blob, durationMs: totalDurationMs, ranges };
}

export { WAV_MIME as ATISMA_TAKE_MIME };
