"use client";

/**
 * The single `AnalyserNode` Flow's live trace reads from (`docs/FLOW.md`:
 * "one `AnalyserNode` attached to the playback store's media element (create
 * once, reuse)").
 *
 * Created once and reused for the app's lifetime: `createMediaElementSource`
 * throws if called a second time on the same `<audio>` element, and the
 * playback store's element is itself a singleton created once
 * (`playbackStore.ts`'s `ensureAudio()`/`defaultCreateAudio()`) — so this
 * module mirrors that same "create once" shape at the Web Audio layer,
 * rather than every `FlowTrace` mount building its own graph.
 */

import type { PlaybackAudioElement, PlaybackStore } from "./playbackStore";

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let attachedElement: PlaybackAudioElement | null = null;

/** Time-domain data needs exactly `fftSize` samples, not `frequencyBinCount` (half that). */
export const FLOW_ANALYSER_FFT_SIZE = 256;

/**
 * The shared `AnalyserNode` for the playback store's current media element,
 * building the `AudioContext` → source → analyser graph the first time an
 * element exists. `null` when there is nothing to analyse yet (no gesture
 * has started playback so the store has never created its `<audio>`
 * element), when Web Audio isn't available (SSR, an unsupported browser),
 * or when connecting the graph fails — every case degrades to "no live
 * amplitude" rather than throwing into a render.
 */
export function getFlowAnalyser(store: PlaybackStore): AnalyserNode | null {
  if (typeof window === "undefined") return null;

  const element = store.getMediaElement();
  if (!element) return null;

  if (element === attachedElement && analyser) {
    void context?.resume();
    return analyser;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  try {
    if (!context) {
      context = new AudioContextCtor();
    }
    void context.resume();

    const source = context.createMediaElementSource(element as unknown as HTMLMediaElement);
    const node = context.createAnalyser();
    node.fftSize = FLOW_ANALYSER_FFT_SIZE;
    source.connect(node);
    node.connect(context.destination);

    analyser = node;
    attachedElement = element;
    return analyser;
  } catch {
    // The store reuses one element for its lifetime, so this branch is only
    // reachable if a browser refuses `createMediaElementSource` entirely —
    // degrade rather than surface a Web Audio error into the trace.
    return null;
  }
}

/**
 * Read the current linear amplitude (`0..1`, RMS of the raw time-domain
 * buffer — deliberately not the analyser's own frequency-domain smoothing,
 * which does not apply to time-domain data anyway) from `analyser` into
 * `buffer`. Called once per animation frame from `FlowTrace`, never from
 * React state, so a live trace costs one style write per frame rather than
 * one render per frame (`WaveformCanvas.tsx`'s own imperative-paint
 * convention).
 */
export function readFlowAmplitude(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centered = (buffer[i] - 128) / 128;
    sumSquares += centered * centered;
  }
  return Math.min(1, Math.sqrt(sumSquares / buffer.length) * 1.6);
}
