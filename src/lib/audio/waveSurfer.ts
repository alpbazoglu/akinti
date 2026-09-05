"use client";

/**
 * The single WaveSurfer instance (`docs/research/libraries.md` §2,
 * `docs/design/DESIGN.md` §6.4).
 *
 * There is exactly one `<audio>` element in this application and exactly one
 * WaveSurfer bound to it, created by `PlaybackStore` on first play and torn
 * down when playback stops. It is imported dynamically so the ~40KB renderer
 * never enters the initial bundle for the feed or profile routes
 * (`mobile-guidelines.md` rule 44).
 *
 * What it is for: when an asset has no stored peaks yet — the worker has not
 * finished, or the asset predates peak storage — this decodes the real audio
 * and hands back real amplitudes, so the placeholder shape is replaced by the
 * actual waveform the moment it can be. When peaks *are* stored they are
 * passed straight in and nothing is fetched twice.
 *
 * What it is not for: drawing. The trace is drawn by `waterline.ts`, because
 * §6's geometry — mirrored halves at 70% alpha, silence as square dots, a
 * square-capped write-head, size-dependent bar pitch — is the identity of the
 * product and is not expressible as renderer options.
 */

import type { PlaybackAudioElement } from "./playbackStore";

export interface WaveSurferHandle {
  destroy(): void;
}

export interface AttachOptions {
  /** Stored peaks, when the asset already has them. Skips the decode fetch. */
  readonly peaks?: readonly number[];
  readonly duration?: number;
  /** Called once with real amplitudes when a decode produced them. */
  readonly onPeaks?: (peaks: number[]) => void;
}

/** How many buckets a decoded trace is exported at. 1024 is plenty at 390px. */
const EXPORT_LENGTH = 1024;

/**
 * Bind WaveSurfer to the shared media element.
 *
 * Returns `null` when it cannot run (no DOM, or the import failed): playback
 * itself never depends on this, so a failure here costs the decoded-peaks
 * upgrade and nothing else.
 */
export async function attachWaveSurfer(
  audio: PlaybackAudioElement,
  options: AttachOptions = {},
): Promise<WaveSurferHandle | null> {
  if (typeof document === "undefined") return null;

  const { default: WaveSurfer } = await import("wavesurfer.js");

  // WaveSurfer needs a container to observe. This one is never painted: the
  // visible trace is our own canvas, and drawing twice would be wasted work.
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);pointer-events:none";
  document.body.appendChild(container);

  const hasPeaks = Boolean(options.peaks && options.peaks.length > 0);

  const instance = WaveSurfer.create({
    container,
    media: audio as unknown as HTMLMediaElement,
    height: 0,
    interact: false,
    // With stored peaks there is nothing to fetch; without them WaveSurfer
    // decodes the media it is already pointed at.
    peaks: hasPeaks ? [Array.from(options.peaks ?? [])] : undefined,
    duration: options.duration && options.duration > 0 ? options.duration : undefined,
  });

  if (!hasPeaks && options.onPeaks) {
    instance.on("decode", () => {
      try {
        const exported = instance.exportPeaks({ channels: 1, maxLength: EXPORT_LENGTH });
        const channel = exported[0];
        if (channel && channel.length > 0) {
          options.onPeaks?.(channel.map((value) => Math.min(1, Math.abs(value))));
        }
      } catch {
        // A decode that fails leaves the placeholder in place, which is the
        // honest state: we do not know this Wave's shape yet.
      }
    });
  }

  return {
    destroy() {
      // WaveSurfer borrowed the media element, it does not own it: destroying
      // the instance detaches its listeners and leaves the `<audio>` alone.
      instance.destroy();
      container.remove();
    },
  };
}
