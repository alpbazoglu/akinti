"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";

import { Waveform } from "@/components/audio";
import {
  clampTrim,
  msAtRatio,
  ratioOf,
  type TrimHandle,
  type TrimRange,
} from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

export interface TrimTraceProps {
  peaks: readonly number[];
  durationMs: number;
  range: TrimRange;
  onRangeChange: (range: TrimRange) => void;
  /** Playback position as a ratio of the whole take. */
  progress: number;
  onSeek: (ratio: number) => void;
  height?: number;
  className?: string;
}

/** Arrow keys nudge by a tenth of a second; shift moves a second at a time. */
const STEP_MS = 100;
const LARGE_STEP_MS = 1000;

/**
 * The finished take with two trim handles on it
 * (`docs/design/SCREENS.md` §4.3).
 *
 * The trace is the control: tapping it seeks, and the handles ride on top of
 * it rather than living in a separate slider underneath (§8.4 — there is
 * never a slider with a filled track). Audio outside the handles keeps being
 * drawn, at 20%, so you can see what you are throwing away instead of
 * watching the waveform get eaten.
 *
 * Each handle is a real ARIA slider with its own value in seconds, so trimming
 * works from a keyboard and reads correctly to a screen reader — the same
 * standard the trace itself already meets as a seek control.
 *
 * The handles are drawn as 2px ink lines with a square cap, deliberately the
 * same mark as the write-head: in this system a vertical ink line always
 * means "a position in time".
 */
export function TrimTrace({
  peaks,
  durationMs,
  range,
  onRangeChange,
  progress,
  onSeek,
  height = 96,
  className,
}: TrimTraceProps) {
  const t = useTranslations("TrimTrace");
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<TrimHandle | null>(null);

  const ratioFromClientX = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const moveHandle = useCallback(
    (handle: TrimHandle, ms: number) => {
      const next =
        handle === "start" ? { ...range, startMs: ms } : { ...range, endMs: ms };
      onRangeChange(clampTrim(next, durationMs, handle));
    },
    [range, durationMs, onRangeChange],
  );

  const handlePointerDown = (handle: TrimHandle) => (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = handle;
  };

  const handlePointerMove = (handle: TrimHandle) => (event: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== handle) return;
    // Linear, zero duration, tracking the finger exactly (§6.3).
    moveHandle(handle, msAtRatio(ratioFromClientX(event.clientX), durationMs));
  };

  // Curried like the handlers above (even though the drag end does not need
  // `handle`) so each `onPointerUp`/`onPointerCancel` call site produces a
  // fresh closure at render time rather than passing a shared, ref-touching
  // function identifier straight through as a prop value.
  const endDrag = (handle: TrimHandle) => (event: PointerEvent<HTMLDivElement>) => {
    void handle;
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (handle: TrimHandle) => (event: KeyboardEvent<HTMLDivElement>) => {
    const current = handle === "start" ? range.startMs : range.endMs;
    const step = event.shiftKey ? LARGE_STEP_MS : STEP_MS;
    let next: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = current + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = current - step;
        break;
      case "Home":
        next = handle === "start" ? 0 : range.startMs;
        break;
      case "End":
        next = handle === "start" ? range.endMs : durationMs;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    moveHandle(handle, next);
  };

  const startRatio = ratioOf(range.startMs, durationMs);
  const endRatio = ratioOf(range.endMs, durationMs);

  const handleProps = (handle: TrimHandle) => {
    const ms = handle === "start" ? range.startMs : range.endMs;
    const ratio = handle === "start" ? startRatio : endRatio;
    return {
      role: "slider" as const,
      tabIndex: 0,
      "aria-label": handle === "start" ? t("trimFromStart") : t("trimToEnd"),
      "aria-valuemin": 0,
      "aria-valuemax": Math.round(durationMs / 1000),
      "aria-valuenow": Math.round(ms / 1000),
      "aria-valuetext": formatDuration(ms / 1000),
      "aria-orientation": "horizontal" as const,
      onPointerDown: handlePointerDown(handle),
      onPointerMove: handlePointerMove(handle),
      onPointerUp: endDrag(handle),
      onPointerCancel: endDrag(handle),
      onKeyDown: handleKeyDown(handle),
      style: { left: `${ratio * 100}%` },
      className: cn(
        "absolute top-0 z-10 h-full w-11 -translate-x-1/2 cursor-col-resize touch-none",
        "flex justify-center",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
      ),
    };
  };

  return (
    <div className={cn("relative w-full select-none", className)} ref={trackRef}>
      <Waveform
        peaks={peaks}
        progress={progress}
        duration={durationMs / 1000}
        onSeek={onSeek}
        height={height}
        state={progress > 0 ? "playing" : "unplayed"}
        label={t("seekWithinYourTake")}
        trim={{ start: startRatio, end: endRatio }}
        fullBleed
      />

      {/* Each handle: a 2px ink line with a square cap, the same mark the
          write-head uses, inside a 44px target (§12.13 of the mobile rules). */}
      <div {...handleProps("start")}>
        <span aria-hidden="true" className="relative h-full w-0.5 bg-ink">
          <span className="absolute -top-px left-1/2 size-1.5 -translate-x-1/2 bg-ink" />
          <span className="absolute -bottom-px left-1/2 size-1.5 -translate-x-1/2 bg-ink" />
        </span>
      </div>
      <div {...handleProps("end")}>
        <span aria-hidden="true" className="relative h-full w-0.5 bg-ink">
          <span className="absolute -top-px left-1/2 size-1.5 -translate-x-1/2 bg-ink" />
          <span className="absolute -bottom-px left-1/2 size-1.5 -translate-x-1/2 bg-ink" />
        </span>
      </div>
    </div>
  );
}
