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

/**
 * Decode every turn's take through one shared `AudioContext`, sequentially,
 * closing it once every take has decoded. `MAX_TURNS` is 8: decoding through
 * `Promise.all` with a fresh context per take (the previous implementation)
 * opened up to 8 concurrent `AudioContext`s, and WebKit has historically
 * capped concurrent contexts at 4 and thrown past the limit — landing an
 * 8-turn atışma on the "couldn't be put together" dead end on exactly the
 * platform the WAV fallback recorder exists for (review2 #6).
 */
async function decodeSequentially(blobs: readonly Blob[]): Promise<AudioBuffer[]> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    throw new Error("The Web Audio API is not available in this browser.");
  }
  const context = new Ctor();
  try {
    const buffers: AudioBuffer[] = [];
    for (const blob of blobs) {
      const arrayBuffer = await blob.arrayBuffer();
      buffers.push(await context.decodeAudioData(arrayBuffer));
    }
    return buffers;
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
  /** Wall-clock duration as reported by the recorder. Kept for the caller's
   * own bookkeeping only — `concatenateAtismaTurns` schedules every take on
   * its own decoded `AudioBuffer.duration`, not on this value. */
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

  const buffers = await decodeSequentially(takes.map((take) => take.blob));
  const sampleRate = buffers[0]!.sampleRate;

  // Ranges are built from each buffer's own decoded duration, not the
  // recorder's reported `durationMs`: the worker trims every later
  // contribution on exactly these boundaries (`DUET_SPEC.md` §atisma), and
  // any drift between the reported and the actually-rendered duration would
  // shift every turn's window after the first (review2 #7).
  const ranges: { startMs: number; endMs: number }[] = [];
  let cursorMs = 0;
  for (const buffer of buffers) {
    const startMs = Math.round(cursorMs);
    const endMs = Math.round(cursorMs + buffer.duration * 1000);
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
