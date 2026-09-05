"use client";

/**
 * Apply a trim to a captured take, producing the blob that actually gets
 * uploaded (`docs/design/SCREENS.md` §4.3).
 *
 * The browser cannot cut a WebM or an MP4 container in place, so the take is
 * decoded, sliced, and re-encoded as WAV (`./wav.ts`). That is lossless
 * relative to what was decoded and every consumer in this system reads it, at
 * the cost of a larger upload — which is the right trade when the alternative
 * is publishing audio the user explicitly cut out.
 *
 * Nothing is re-encoded when the handles were never moved: `applyTrim`
 * returns the original blob untouched, so the ordinary "record and publish"
 * path never pays for a decode it does not need.
 */

import { isTrimmed, type TrimRange } from "./trim";
import { encodeWavBlob, WAV_MIME } from "./wav";

export interface TrimmedAudio {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/**
 * Cut `blob` down to `range`.
 *
 * Returns the input unchanged when there is nothing to cut. Throws only when
 * the audio cannot be decoded at all, which the caller surfaces as "we
 * couldn't trim this take" rather than losing the recording.
 */
export async function applyTrim(
  blob: Blob,
  mimeType: string,
  durationMs: number,
  range: TrimRange,
): Promise<TrimmedAudio> {
  if (!isTrimmed(range, durationMs)) {
    return { blob, mimeType, durationMs };
  }

  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    return { blob, mimeType, durationMs };
  }

  const context = new Ctor();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const startSample = Math.floor((range.startMs / 1000) * decoded.sampleRate);
    const endSample = Math.ceil((range.endMs / 1000) * decoded.sampleRate);
    const trimmed = encodeWavBlob(decoded, { startSample, endSample });
    return {
      blob: trimmed,
      mimeType: WAV_MIME,
      durationMs: Math.round(((endSample - startSample) / decoded.sampleRate) * 1000),
    };
  } finally {
    try {
      await context.close();
    } catch {
      // Already closed.
    }
  }
}
