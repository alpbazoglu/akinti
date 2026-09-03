/**
 * Recording capability detection (spec section 17).
 *
 * `MediaRecorder` support and the set of container/codec combinations a
 * browser accepts differ per platform — most notably Safari, which never
 * shipped Opus/WebM and expects AAC in an MP4 container instead. Callers
 * should always go through `getRecordingMimeType()` rather than hardcoding a
 * mime type, and check `isRecordingSupported()` before offering the recorder
 * UI at all.
 */

/**
 * Candidate mime types, most preferred first. `audio/webm;codecs=opus` is the
 * best fit for `scripts/worker.ts` (ffmpeg reads it directly and it is small
 * for its quality); `audio/mp4` is Safari's supported container; the final
 * two are broader fallbacks for other engines.
 */
export const RECORDING_MIME_CANDIDATES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** True when the `MediaRecorder` constructor exists on `window`. */
export function isMediaRecorderSupported(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

/** True when `navigator.mediaDevices.getUserMedia` exists. */
export function isGetUserMediaSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices !== "undefined" &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/** True when in-app recording can be offered at all. */
export function isRecordingSupported(): boolean {
  return isMediaRecorderSupported() && isGetUserMediaSupported();
}

/**
 * The best mime type this browser's `MediaRecorder` will accept, checked in
 * preference order via `MediaRecorder.isTypeSupported`. Returns `null` when
 * `MediaRecorder` is unavailable or none of the candidates are supported —
 * callers should treat that as "recording unsupported", not silently record
 * with the browser's undocumented default.
 */
export function getRecordingMimeType(
  candidates: readonly string[] = RECORDING_MIME_CANDIDATES,
): string | null {
  if (!isMediaRecorderSupported()) return null;

  for (const candidate of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // Some engines throw on an unrecognised string instead of returning
      // false; treat that the same as "not supported" and keep looking.
      continue;
    }
  }

  return null;
}
