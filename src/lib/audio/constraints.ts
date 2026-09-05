/**
 * `getUserMedia` constraints for capture (`docs/research/mobile-guidelines.md`
 * rules 20 and 21, §3 "getUserMedia constraints for singing").
 *
 * AKINTI records singing, so the browser's voice-call processing chain is the
 * enemy: automatic gain control pumps a held note, echo cancellation notches
 * out whatever is coming back through the speakers (which, for a person
 * singing over a backing track, is the music), and noise suppression treats a
 * quiet vowel tail as noise and gates it. All three are therefore **off by
 * default**, which is the opposite of a voice-note app.
 *
 * The Chrome quirk documented in Chromium issue 327472528 is why
 * `echoCancellation: false` is always sent alongside `autoGainControl:
 * false`: on that engine AGC is not fully released unless echo cancellation
 * is released too, so sending only `autoGainControl: false` silently leaves
 * the gain rider running.
 *
 * The "I'm in a noisy room" toggle deliberately does NOT turn any of these
 * back on. It enables an RNNoise monitor (`./monitor.ts`) that the singer
 * hears in their headphones; the recorded stream stays untouched, because
 * baking a denoiser into the take is a decision the user cannot undo and the
 * server pipeline (`docs/AUDIO_ARCHITECTURE.md`) does that job better with
 * DeepFilterNet.
 *
 * Pure and DOM-free so the constraint matrix can be asserted in a unit test
 * rather than read off a live browser.
 */

export interface CaptureConstraintOptions {
  /** `deviceId` of a specific input, from `enumerateDevices`. */
  readonly deviceId?: string | null;
  /**
   * `true` only for a spoken audio message, where the browser's voice chain
   * is genuinely the right thing (rule 21). Never for a Wave.
   */
  readonly voiceMode?: boolean;
}

/**
 * Constraints for capturing a performance. Everything the browser would
 * "helpfully" do to a voice call is switched off.
 */
export function buildCaptureConstraints(
  options: CaptureConstraintOptions = {},
): MediaStreamConstraints {
  const processing = options.voiceMode === true;

  const audio: MediaTrackConstraints = {
    echoCancellation: processing,
    noiseSuppression: processing,
    autoGainControl: processing,
    // One channel: a phone has one capsule, and a stereo take from a mono
    // source doubles the upload for nothing.
    channelCount: 1,
  };

  if (options.deviceId) {
    // `exact` so a device the user picked and then unplugged fails loudly
    // instead of silently recording the built-in microphone instead.
    audio.deviceId = { exact: options.deviceId };
  }

  return { audio, video: false };
}

/**
 * The sample rate the RNNoise worklet assumes
 * (`@sapphi-red/web-noise-suppressor` states 48 kHz explicitly). The
 * monitoring `AudioContext` asks for it and falls back to the hardware rate
 * when the engine refuses.
 */
export const MONITOR_SAMPLE_RATE = 48_000;

/**
 * Where the vendored RNNoise files are served from (`public/noise-suppressor/`).
 * Shared by every place that loads the worklet — the live recording monitor
 * (`./monitor.ts`) and the Enhance screen's polish preview
 * (`./preview/PolishPreview.ts`) — so there is exactly one set of paths to
 * keep in sync with what actually ships under `public/`.
 */
export const RNNOISE_WORKLET_URL = "/noise-suppressor/rnnoise-worklet.js";
export const RNNOISE_WASM_URL = "/noise-suppressor/rnnoise.wasm";
export const RNNOISE_WASM_SIMD_URL = "/noise-suppressor/rnnoise_simd.wasm";
