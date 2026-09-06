"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { WaveformCanvas, type TraceHue, type WaterlineState } from "@/components/audio";
import { usePlaybackStore } from "@/lib/audio";
import {
  FLOW_ANALYSER_FFT_SIZE,
  getFlowAnalyser,
  readFlowAmplitude,
  resetFlowSilenceTracking,
  trackFlowSilence,
} from "@/lib/audio/analyser";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/ui";

export interface FlowTraceProps {
  peaks: readonly number[];
  progress: number;
  loaded?: number;
  state: WaterlineState;
  hue?: TraceHue;
  height?: number;
  /** Drag-to-seek on the trace itself (`docs/FLOW.md` "scrub on the trace"). Omit to disable scrubbing (the "up next" hairline). */
  onScrub?: (ratio: number) => void;
  className?: string;
}

const SCRUB_MOVE_THRESHOLD_PX = 6;

/**
 * Flow's big live trace (`docs/FLOW.md`).
 *
 * The shape is the standard peaks/progress waterline (`WaveformCanvas`,
 * unmodified) plus a genuine live-amplitude pulse read once per animation
 * frame from the single shared `AnalyserNode` (`src/lib/audio/analyser.ts`)
 * attached to the playback store's media element. The pulse is applied with
 * `element.style` directly rather than React state — one style write per
 * frame instead of one render per frame — and is a direct, unsmoothed scale
 * (linear motion, no easing, `docs/design/DESIGN.md` §6.3).
 * `prefers-reduced-motion` stops the loop entirely: the trace then shows
 * exactly the static peaks, which is the "freeze to peaks" `docs/FLOW.md`
 * asks for.
 *
 * When `onScrub` is given, a pointer drag on the trace reports the pointer's
 * ratio across its width. A tap (no meaningful movement) does not call
 * `onScrub` and is left to bubble to the screen's own tap/double-tap/swipe
 * handling — only an actual drag is treated as scrubbing.
 */
export function FlowTrace({ peaks, progress, loaded = 1, state, hue, height = 208, onScrub, className }: FlowTraceProps) {
  const store = usePlaybackStore();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const bufferRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(FLOW_ANALYSER_FFT_SIZE));
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (reducedMotion || state !== "playing") {
      if (wrapper) wrapper.style.transform = "";
      return;
    }
    if (!wrapper) return;

    let frame = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const analyser = getFlowAnalyser(store);
      if (analyser) {
        const level = readFlowAmplitude(analyser, bufferRef.current);
        // A full second of near-zero amplitude while playing means the live
        // pulse is not real signal (review3 finding 5) — stop scaling on
        // noise-floor jitter and just show the static peaks underneath
        // rather than fake motion.
        const silent = trackFlowSilence(level, performance.now());
        wrapper.style.transform = silent ? "" : `scaleY(${1 + level * 0.06})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      resetFlowSilenceTracking();
      wrapper.style.transform = "";
    };
  }, [store, state, reducedMotion]);

  const ratioFromEvent = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onScrub) return;
    dragRef.current = { startX: event.clientX, startY: event.clientY, dragging: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onScrub || !dragRef.current) return;
    const dx = Math.abs(event.clientX - dragRef.current.startX);
    const dy = Math.abs(event.clientY - dragRef.current.startY);
    if (!dragRef.current.dragging && Math.max(dx, dy) < SCRUB_MOVE_THRESHOLD_PX) return;
    // A horizontal-enough drag is a scrub; a mostly-vertical one is the
    // screen's own swipe — stop claiming the gesture once that's clear.
    if (!dragRef.current.dragging && dy > dx) {
      dragRef.current = null;
      return;
    }
    dragRef.current.dragging = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    onScrub(ratioFromEvent(event));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.dragging) {
      event.stopPropagation();
    }
    dragRef.current = null;
  };

  return (
    <div
      data-flow-trace="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(onScrub && "cursor-pointer touch-none", className)}
    >
      <div ref={wrapperRef} className="origin-bottom">
        <WaveformCanvas peaks={peaks} progress={progress} loaded={loaded} state={state} height={height} playhead hue={hue} />
      </div>
    </div>
  );
}
