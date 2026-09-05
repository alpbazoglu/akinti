/**
 * Which recorder implementation to use, decided once per capture
 * (`docs/research/libraries.md` §1).
 *
 * Native `MediaRecorder` is the fast path everywhere it produces something
 * ffmpeg reads cheaply. Apple's WebKit is the exception: what it writes has
 * changed three times in three OS versions (AAC-in-MP4 through iOS 18.3, then
 * WebM/Opus, Ogg, fragmented MP4 and lossless ALAC/PCM from 18.4), and the
 * lossless containers in particular are the ones the worker has choked on. So
 * on WebKit the capture is routed through `extendable-media-recorder` plus its
 * WAV encoder, which always writes a plain RIFF/WAVE file: bigger on the wire,
 * but decodable by every consumer in this system without a per-OS-version
 * branch. Rule 22 of `mobile-guidelines.md` — feature-detect, never hardcode
 * `audio/webm` — is satisfied by `probeNativeMimeType` below.
 *
 * Everything here is pure: the decision is made from a description of the
 * environment, not by touching it, so `recorderPlan.test.ts` can assert the
 * iOS fallback selection without an iPhone.
 */

export type RecorderKind = "native" | "wav";

export interface RecorderPlan {
  readonly kind: RecorderKind;
  /** The mime type to hand the recorder, and to tag the resulting blob with. */
  readonly mimeType: string;
  /** Plain-English reason, for the report the record screen can surface. */
  readonly reason: string;
}

/** What the WAV fallback always produces. `audio/wav` is in `ALLOWED_AUDIO_MIME_TYPES`. */
export const WAV_MIME_TYPE = "audio/wav";

/**
 * Native candidates, most preferred first. `audio/webm;codecs=opus` is what
 * `scripts/worker.ts` reads most cheaply and is the smallest for its quality.
 * Safari's `audio/mp4` is deliberately absent: WebKit goes down the WAV path.
 */
export const NATIVE_MIME_CANDIDATES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export interface RecorderEnvironment {
  /** `typeof window.MediaRecorder !== "undefined"`. */
  readonly hasMediaRecorder: boolean;
  /** `MediaRecorder.isTypeSupported`, or a stub that always returns false. */
  readonly isTypeSupported: (mimeType: string) => boolean;
  readonly userAgent: string;
  /** `navigator.vendor`; "Apple Computer, Inc." on every WebKit build. */
  readonly vendor?: string;
  /** `navigator.maxTouchPoints`; iPadOS reports a desktop UA but > 0 here. */
  readonly maxTouchPoints?: number;
}

/**
 * True for Safari and for every browser on iOS/iPadOS (all of which are
 * WebKit under the shell, so they inherit the same `MediaRecorder`).
 *
 * iPadOS 13+ claims to be "Macintosh" in its UA string, which is why
 * `maxTouchPoints` is part of the test rather than the UA alone.
 */
export function isAppleWebKit(env: RecorderEnvironment): boolean {
  const ua = env.userAgent ?? "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // Chrome and Edge on macOS also say "Safari" in their UA; the distinguishing
  // token is the absence of Chrome/Chromium/Firefox alongside it.
  const isSafariUa = /Safari/i.test(ua) && !/Chrom(e|ium)|Android|Firefox|FxiOS/i.test(ua);
  if (isSafariUa) return true;
  const looksMac = /Macintosh/i.test(ua);
  return looksMac && (env.maxTouchPoints ?? 0) > 1;
}

/** The best native container this engine actually accepts, or `null`. */
export function probeNativeMimeType(
  env: RecorderEnvironment,
  candidates: readonly string[] = NATIVE_MIME_CANDIDATES,
): string | null {
  if (!env.hasMediaRecorder) return null;
  for (const candidate of candidates) {
    try {
      if (env.isTypeSupported(candidate)) return candidate;
    } catch {
      // Some engines throw on an unrecognised string rather than returning
      // false. That is "not supported", not a crash.
      continue;
    }
  }
  return null;
}

/**
 * Decide how to record. Never returns `null`: the WAV encoder ships its own
 * `MediaRecorder` implementation, so a browser without a native one can still
 * record as long as it has `getUserMedia` and an `AudioWorklet` — which
 * `isRecordingSupported()` (`./capabilities.ts`) checks separately.
 */
export function planRecorder(env: RecorderEnvironment): RecorderPlan {
  if (isAppleWebKit(env)) {
    return {
      kind: "wav",
      mimeType: WAV_MIME_TYPE,
      reason: "Recording as WAV so this take opens everywhere.",
    };
  }

  const native = probeNativeMimeType(env);
  if (native) {
    return { kind: "native", mimeType: native, reason: "Recording with this browser's recorder." };
  }

  return {
    kind: "wav",
    mimeType: WAV_MIME_TYPE,
    reason: "Recording as WAV so this take opens everywhere.",
  };
}

/** Reads the live browser. Separated so `planRecorder` itself stays pure. */
export function describeEnvironment(): RecorderEnvironment {
  const hasMediaRecorder =
    typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
  return {
    hasMediaRecorder,
    isTypeSupported: (mimeType: string) =>
      hasMediaRecorder ? window.MediaRecorder.isTypeSupported(mimeType) : false,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    vendor: typeof navigator === "undefined" ? undefined : navigator.vendor,
    maxTouchPoints: typeof navigator === "undefined" ? undefined : navigator.maxTouchPoints,
  };
}
