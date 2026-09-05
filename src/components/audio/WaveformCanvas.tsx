"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { cn } from "@/lib/ui";

import {
  drawWaterline,
  type TraceHue,
  type WaterlineColors,
  type WaterlineState,
  type WaterlineTrim,
} from "./waterline";

export interface WaveformCanvasProps {
  /** Normalised peak amplitudes, `0..1`. Resampled, never stretched. */
  peaks: readonly number[];
  /** The collaborator's trace, drawn downward in ink when `state` is `duet`. */
  duetPeaks?: readonly number[];
  /** Playback position, `0..1`. */
  progress?: number;
  /** Buffered fraction, `0..1`. */
  loaded?: number;
  state?: WaterlineState;
  /** Trace height in CSS pixels. Geometry follows from it (§6.1). */
  height?: number;
  /** Draw the 2px ink write-head. */
  playhead?: boolean;
  /** Kept region of a take being trimmed; the rest draws at 20% (§4.3). */
  trim?: WaterlineTrim;
  /**
   * Recolours the unplayed/dormant part of the trace with a mode or genre
   * hue (`docs/design/COLOR_V2.md`). Omitted means the current, the
   * default brand teal. The played region is always Signal, regardless of
   * `hue` — Signal stays exclusive to live audio state.
   */
  hue?: TraceHue;
  className?: string;
}

const THEME_QUERY = "(prefers-color-scheme: dark)";

/**
 * Colours live in CSS custom properties so light and dark resolve themselves,
 * but a canvas cannot read a CSS variable — it needs a computed string. This
 * subscribes to both ways the theme can change: the system preference, and the
 * `data-theme` attribute the Settings toggle writes.
 */
function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia?.(THEME_QUERY);
  media?.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    media?.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function themeSnapshot(): string {
  if (typeof document === "undefined") return "light";
  return (
    document.documentElement.dataset.theme ??
    (window.matchMedia?.(THEME_QUERY).matches ? "dark" : "light")
  );
}

function readColors(element: Element, hue?: TraceHue): WaterlineColors {
  const styles = getComputedStyle(element);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    rest: read("--akinti-wave-rest", "#a9bdb4"),
    // A `hue` recolours only the unplayed/dormant part of the trace — the
    // played part is always Signal (COLOR_V2 principle 2: Signal stays
    // exclusive to live audio, never chosen by content).
    dormant: hue
      ? read(`--akinti-hue-${hue}`, "#0e6b6b")
      : read("--akinti-wave-dormant", "#0e6b6b"),
    played: read("--akinti-signal", "#de3c11"),
    ink: read("--akinti-ink", "#0f1a18"),
  };
}

/**
 * The waterline as a Canvas 2D surface (§6.4).
 *
 * One primitive, one drawing, every size: the feed, the detail player, the
 * recorder, a comment, a message and an analytics series all come through
 * here, which is the payoff of having a single motif.
 *
 * The trace never animates on mount — a waveform that draws itself in is
 * decoration (§6.3) — and it redraws only when its inputs, its size or the
 * theme change, so a feed of traces costs one paint each and nothing per frame.
 */
export function WaveformCanvas({
  peaks,
  duetPeaks,
  progress = 0,
  loaded = 1,
  state = "unplayed",
  height = 56,
  playhead = false,
  trim,
  hue,
  className,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "light");

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const width = Math.floor(parent?.clientWidth ?? canvas.clientWidth);
    if (width <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawWaterline(ctx, {
      peaks,
      duetPeaks,
      width,
      height,
      state,
      colors: readColors(canvas, hue),
      progress,
      loaded,
      playhead,
      trim,
    });
  }, [peaks, duetPeaks, progress, loaded, state, height, playhead, trim, hue]);

  useEffect(() => {
    paint();
  }, [paint, theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;

    // Peak data is resampled on resize, never stretched (`DESIGN_DNA.json`).
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    });
    observer.observe(parent);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [paint]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ height }}
      className={cn("block w-full", className)}
    />
  );
}
