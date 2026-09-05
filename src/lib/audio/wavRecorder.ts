"use client";

/**
 * The WAV fallback recorder (`docs/research/libraries.md` §1,
 * `./recorderPlan.ts`).
 *
 * `extendable-media-recorder` is a `MediaRecorder` polyfill whose encoders are
 * pluggable; registering `extendable-media-recorder-wav-encoder` gives it an
 * `audio/wav` encoder running in an `AudioWorklet`, so every take from an
 * Apple WebKit browser arrives as a plain RIFF/WAVE file instead of whatever
 * that OS version happens to write this year.
 *
 * The encoder is registered exactly once per document. `register()` throws if
 * called twice for the same port, so the promise is memoised rather than the
 * call repeated, and a failed registration clears the memo so a later attempt
 * can retry rather than being stuck on a rejected promise forever.
 *
 * Everything is behind a dynamic `import()`: none of this belongs in the
 * bundle of a browser that will never use it (`mobile-guidelines.md` rule 44).
 */

import type { RecorderMediaRecorderLike, RecorderMediaStreamLike } from "./recorder";

let registration: Promise<void> | null = null;

/** Register the WAV encoder with the polyfill. Idempotent. */
export async function ensureWavEncoderRegistered(): Promise<void> {
  if (registration) return registration;

  registration = (async () => {
    const [{ register }, { connect }] = await Promise.all([
      import("extendable-media-recorder"),
      import("extendable-media-recorder-wav-encoder"),
    ]);
    await register(await connect());
  })();

  try {
    await registration;
  } catch (error) {
    registration = null;
    throw error;
  }

  return registration;
}

/**
 * Build a `MediaRecorder`-shaped object that writes WAV. Structurally
 * compatible with `RecorderMediaRecorderLike`, which is deliberately the
 * narrow subset `AudioRecorder` actually touches.
 */
export async function createWavRecorder(
  stream: RecorderMediaStreamLike,
  mimeType: string,
): Promise<RecorderMediaRecorderLike> {
  await ensureWavEncoderRegistered();
  const { MediaRecorder: ExtendableMediaRecorder } = await import("extendable-media-recorder");
  return new ExtendableMediaRecorder(stream as unknown as MediaStream, {
    mimeType,
  }) as unknown as RecorderMediaRecorderLike;
}
