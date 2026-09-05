"use client";

import { useCallback, useEffect, useRef } from "react";

import { LIVE_WINDOW_MS } from "@/lib/audio/recordingConfig";
import type { LiveMonitor, MonitorSample } from "@/lib/audio/monitor";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/ui";

import { drawWaterline, geometryFor, type WaterlineColors } from "./waterline";

export interface LiveWaterlineProps {
  /** The monitor to read. `null` renders the dormant tick row. */
  monitor: LiveMonitor | null;
  /** Drives the loop. False freezes the trace where it is (paused). */
  active: boolean;
  /** Trace height in CSS pixels. Geometry follows from it (§6.1). */
  height?: number;
  /**
   * The latest level and pitch, at about 10Hz. One loop feeds the drawing and
   * the readouts; a second `requestAnimationFrame` for the numbers would be a
   * second sample of the same analyser at a different instant.
   */
  onSample?: (sample: MonitorSample) => void;
  className?: string;
}

/** How often the readouts update. Faster than this and the numbers are unreadable. */
const READOUT_INTERVAL_MS = 100;

/** Reduced motion still shows the level, at a rate that is not animation. */
const REDUCED_MOTION_INTERVAL_MS = 250;

const THEME_QUERY = "(prefers-color-scheme: dark)";

function readColors(element: Element): WaterlineColors {
  const styles = getComputedStyle(element);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    rest: read("--akinti-wave-rest", "#b4b4ad"),
    dormant: read("--akinti-wave-dormant", "#86877e"),
    played: read("--akinti-signal", "#de3c11"),
    ink: read("--akinti-ink", "#191a17"),
  };
}

/**
 * The live trace (`docs/design/DESIGN.md` §6.2, `SCREENS.md` §4.2).
 *
 * The whole trace in Signal, scrolling right to left through a ten-second
 * window, drawn from RMS rather than peak so it moves smoothly, with the
 * write-head as a 2px ink line pinned at the right edge. Nothing here eases
 * and nothing interpolates: a bar appears at the write-head at the rate the
 * input arrives, which is the one thing on this screen that must not lie
 * (§6.3, §12.7).
 *
 * It owns its own canvas and its own `requestAnimationFrame` loop instead of
 * going through `WaveformCanvas`, because pushing a new peaks array into
 * React sixty times a second would re-render the record screen sixty times a
 * second. The loop exists only while `active`, and is torn down on pause, on
 * unmount and under `prefers-reduced-motion` (§6.4, §7.3), where the trace
 * still updates — four times a second, from the same samples — because the
 * level is state, and §7.3 removes movement, never state.
 */
export function LiveWaterline({
  monitor,
  active,
  height = 96,
  onSample,
  className,
}: LiveWaterlineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef<number[]>([]);
  /** Peak of the slice currently being accumulated into the newest bar. */
  const sliceRef = useRef({ peak: 0, startedAt: 0 });
  const lastReadoutRef = useRef(0);
  const reducedMotion = useReducedMotion();

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

    const geometry = geometryFor(height);
    const barCount = Math.max(1, Math.floor((width + geometry.gap) / geometry.pitch));
    const samples = samplesRef.current;

    if (samples.length === 0) {
      drawWaterline(ctx, {
        peaks: [],
        width,
        height,
        state: "dormant",
        colors: readColors(canvas),
      });
      return;
    }

    // Right-to-left: the newest sample sits at the write-head, and a window
    // that is not yet full is left-padded with silence rather than stretched.
    const visible = samples.slice(-barCount);
    const padded =
      visible.length < barCount
        ? [...new Array<number>(barCount - visible.length).fill(0), ...visible]
        : visible;

    drawWaterline(ctx, {
      peaks: padded,
      width,
      height,
      state: "recording",
      colors: readColors(canvas),
      playhead: true,
    });
  }, [height]);

  // One loop, whether it is driven by frames or by a timer. `active` gates it
  // entirely: a paused recorder redraws nothing and costs nothing.
  useEffect(() => {
    if (!active || !monitor) {
      paint();
      return;
    }

    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const width = Math.floor(parent?.clientWidth ?? 0);
    const geometry = geometryFor(height);
    const barCount = Math.max(1, Math.floor((width + geometry.gap) / geometry.pitch));
    const sliceMs = LIVE_WINDOW_MS / barCount;

    sliceRef.current = { peak: 0, startedAt: performance.now() };

    let frame = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const sample = monitor.sample();
      const now = performance.now();

      const slice = sliceRef.current;
      if (sample.rms > slice.peak) slice.peak = sample.rms;

      if (now - slice.startedAt >= sliceMs) {
        samplesRef.current.push(slice.peak);
        // Keep a little more than one screen so a resize has history to draw.
        if (samplesRef.current.length > barCount * 2) samplesRef.current.shift();
        sliceRef.current = { peak: 0, startedAt: now };
        paint();
      }

      if (onSample && now - lastReadoutRef.current >= READOUT_INTERVAL_MS) {
        lastReadoutRef.current = now;
        onSample(sample);
      }
    };

    if (reducedMotion) {
      timer = setInterval(tick, REDUCED_MOTION_INTERVAL_MS);
    } else {
      const loop = () => {
        tick();
        if (!stopped) frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearInterval(timer);
    };
  }, [active, monitor, paint, height, onSample, reducedMotion]);

  // Reset the window whenever the monitor is replaced: a new take starts from
  // silence, never from the previous take's tail.
  useEffect(() => {
    samplesRef.current = [];
    paint();
  }, [monitor, paint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(parent);
    return () => observer.disconnect();
  }, [paint]);

  // The canvas cannot read a CSS variable, so a theme change has to repaint.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia?.(THEME_QUERY);
    const onChange = () => paint();
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
  }, [paint]);

  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ height }} className="block w-full" />
    </div>
  );
}
