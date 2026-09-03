"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn, formatDuration } from "@/lib/ui";

export type WaveformVariant = "bars" | "mirror";

export interface WaveformProps {
  /** Normalised peak amplitudes, `0..1`, one per bar. */
  peaks: readonly number[];
  /** Playback position as a ratio of the total duration, `0..1`. */
  progress?: number;
  /** Total duration in seconds; used for the accessible value text. */
  duration?: number;
  /** Called with a `0..1` ratio on click, drag and keyboard seek. */
  onSeek?: (ratio: number) => void;
  variant?: WaveformVariant;
  /** Bar area height in pixels. */
  height?: number;
  /** Accessible name for the seek control. */
  label?: string;
  /** Renders as a static picture: no seeking, not focusable. */
  readOnly?: boolean;
  disabled?: boolean;
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
 * The visual anchor of a Wave (spec section 20). Renders stored peak data —
 * it never decodes audio — so a card is cheap to render and identical on the
 * server and the client.
 *
 * Exposed as an ARIA slider so the waveform is a real, operable seek control
 * for keyboard and screen-reader users, not just a picture (spec section 29).
 */
export function Waveform({
  peaks,
  progress = 0,
  duration = 0,
  onSeek,
  variant = "bars",
  height = 48,
  label = "Seek",
  readOnly = false,
  disabled = false,
  className,
}: WaveformProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const interactive = Boolean(onSeek) && !readOnly && !disabled;

  const normalised = useMemo(
    () => peaks.map((peak) => clamp01(Math.abs(peak))),
    [peaks],
  );

  const ratio = clamp01(progress);
  const percent = Math.round(ratio * 100);
  const currentSeconds = duration > 0 ? ratio * duration : 0;

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

  const barCount = normalised.length;

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
        "relative flex w-full gap-[2px] rounded-sm select-none",
        variant === "mirror" ? "items-center" : "items-end",
        interactive && "cursor-pointer touch-none",
        interactive && "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        disabled && "opacity-55",
        className,
      )}
    >
      {barCount === 0 ? (
        <span className="h-[2px] w-full rounded-full bg-wave-track" aria-hidden="true" />
      ) : (
        normalised.map((peak, index) => {
          const played = barCount > 1 ? index / (barCount - 1) <= ratio : ratio > 0;
          const barHeight = Math.max(6, Math.round(peak * 100));
          return (
            <span
              key={index}
              aria-hidden="true"
              style={{ height: `${barHeight}%` }}
              className={cn(
                "min-w-[2px] flex-1 rounded-full transition-colors duration-75",
                played ? "bg-wave-progress" : "bg-wave-track",
              )}
            />
          );
        })
      )}
    </div>
  );
}

/**
 * Deterministic placeholder peaks. Useful for skeletons and the component
 * gallery; never use it to fake a real Wave.
 */
export function placeholderPeaks(count = 64, seed = 1): number[] {
  const peaks: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const hashed = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const noise = hashed - Math.floor(hashed);
    // A gentle envelope so the shape reads as audio, not as random bars.
    const envelope = Math.sin((index / Math.max(1, count - 1)) * Math.PI);
    peaks.push(0.18 + 0.72 * (0.35 + 0.65 * noise) * (0.45 + 0.55 * envelope));
  }
  return peaks;
}
