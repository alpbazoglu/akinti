"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { placeholderPeaks } from "@/lib/audio/peaks";
import { cn, formatDuration } from "@/lib/ui";

import { WaveformCanvas } from "./WaveformCanvas";
import type { WaterlineState, WaterlineTrim } from "./waterline";

export { placeholderPeaks };

export interface WaveformProps {
  /** Normalised peak amplitudes, `0..1`. Real peaks from the asset; the
   * deterministic placeholder only while the worker is still processing. */
  peaks: readonly number[];
  /** The collaborator's trace for a Duet, drawn downward in ink (§6.2). */
  duetPeaks?: readonly number[];
  /** Playback position as a ratio of the total duration, `0..1`. */
  progress?: number;
  /** Buffered fraction, `0..1`. A partial buffer draws at 40% alpha (§6.2). */
  loaded?: number;
  /** Total duration in seconds; used for the accessible value text. */
  duration?: number;
  /** Called with a `0..1` ratio on click, drag and keyboard seek. */
  onSeek?: (ratio: number) => void;
  /** Trace height in CSS pixels. All geometry follows from it (§6.1). */
  height?: number;
  /** `dormant` before anything is loaded, `duet` for the mirrored pair. */
  state?: WaterlineState;
  /** Accessible name for the seek control. */
  label?: string;
  /** Renders as a static picture: no seeking, not focusable. */
  readOnly?: boolean;
  disabled?: boolean;
  /** Applies the 24px edge fade, for a trace that bleeds past the page edges. */
  fullBleed?: boolean;
  /**
   * Kept region of a take being trimmed, as ratios. Everything outside it
   * draws at 20% (`docs/design/SCREENS.md` §4.3). The handles themselves are
   * the caller's: this only changes the drawing.
   */
  trim?: WaterlineTrim;
  className?: string;
}

/** Keyboard seek steps, as a ratio of total duration. */
const STEP = 0.01;
const LARGE_STEP = 0.1;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * The waterline as an operable control (§6, §8.4).
 *
 * Tap anywhere on the trace to play from that point: the trace *is* the
 * scrubber, and there is never a separate slider with a filled track (§8.4,
 * §12.30). Drag tracks the finger exactly, linearly, at zero duration.
 *
 * Exposed as an ARIA slider so the trace is a real seek control for keyboard
 * and screen-reader users rather than a picture, and the playhead — not the
 * colour — carries the played/unplayed boundary (§6.2).
 */
export function Waveform({
  peaks,
  duetPeaks,
  progress = 0,
  loaded = 1,
  duration = 0,
  onSeek,
  height = 56,
  state,
  label = "Seek",
  readOnly = false,
  disabled = false,
  fullBleed = false,
  trim,
  className,
}: WaveformProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const interactive = Boolean(onSeek) && !readOnly && !disabled;

  const ratio = clamp01(progress);
  const percent = Math.round(ratio * 100);
  const currentSeconds = duration > 0 ? ratio * duration : 0;

  const resolvedState: WaterlineState =
    state ?? (peaks.length === 0 ? "dormant" : ratio > 0 ? "playing" : "unplayed");

  const ratioFromClientX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !onSeek) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onSeek(ratioFromClientX(event.clientX));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !dragging || !onSeek) return;
    onSeek(ratioFromClientX(event.clientX));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !onSeek) return;

    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = ratio + STEP;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = ratio - STEP;
        break;
      case "PageUp":
        next = ratio + LARGE_STEP;
        break;
      case "PageDown":
        next = ratio - LARGE_STEP;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    onSeek(clamp01(next));
  };

  const valueText =
    duration > 0
      ? `${formatDuration(currentSeconds)} of ${formatDuration(duration)}`
      : `${percent}%`;

  return (
    <div
      ref={trackRef}
      role={interactive ? "slider" : "img"}
      aria-label={label}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? percent : undefined}
      aria-valuetext={interactive ? valueText : undefined}
      aria-disabled={disabled || undefined}
      aria-orientation={interactive ? "horizontal" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      style={{ height }}
      className={cn(
        "relative w-full select-none",
        // A trace is the largest target on its screen, so it takes the whole
        // width and the pointer becomes an I-beam over it (§12.10, DNA cursor).
        interactive && "cursor-col-resize touch-none",
        interactive &&
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
        disabled && "opacity-55",
        fullBleed && "akinti-edge-fade",
        className,
      )}
    >
      <WaveformCanvas
        peaks={peaks}
        duetPeaks={duetPeaks}
        progress={ratio}
        loaded={loaded}
        state={resolvedState}
        height={height}
        playhead={resolvedState === "playing" || resolvedState === "duet"}
        trim={trim}
      />
    </div>
  );
}
