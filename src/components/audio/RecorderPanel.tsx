"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Pause, Play, RotateCcw, Square, TriangleAlert } from "lucide-react";

import { useRecorder, type RecorderResult, type RecorderStatus } from "@/lib/audio";
import { Button, IconButton } from "@/components/ui";
import { cn, formatDuration } from "@/lib/ui";

export interface RecorderPanelProps {
  /** Called once, the moment a take finishes (auto-stop or manual stop). */
  onComplete?: (result: RecorderResult) => void;
  maxDurationMs?: number;
  className?: string;
}

/**
 * In-app microphone recorder (spec §17). A big record button, an elapsed
 * timer, a live level meter, and pause/resume/stop/retake — every state the
 * spec calls out (idle/requesting/denied/unsupported/recording/paused/
 * stopped/error) has an honest visual and an `aria-live` announcement, never
 * a silent failure (spec §38).
 */
export function RecorderPanel({ onComplete, maxDurationMs, className }: RecorderPanelProps) {
  const { state, start, pause, resume, stop, retake } = useRecorder(
    maxDurationMs !== undefined ? { maxDurationMs } : undefined,
  );
  const reportedResultRef = useRef<RecorderResult | null>(null);

  useEffect(() => {
    if (state.result && state.result !== reportedResultRef.current) {
      reportedResultRef.current = state.result;
      onComplete?.(state.result);
    }
  }, [state.result, onComplete]);

  const seconds = state.elapsedMs / 1000;
  const maxSeconds = state.maxDurationMs / 1000;
  const levelPercent = Math.round(state.level * 100);

  return (
    <div className={cn("flex flex-col items-center gap-5 py-4", className)}>
      <div
        className="text-3xl font-semibold tabular-nums text-fg"
        aria-hidden="true"
      >
        {formatDuration(seconds)}
        {state.status === "recording" || state.status === "paused" ? (
          <span className="ml-1.5 text-sm font-normal text-fg-subtle">
            / {formatDuration(maxSeconds)}
          </span>
        ) : null}
      </div>

      <LevelMeter level={state.level} active={state.status === "recording"} />

      <div aria-live="polite" role="status" className="sr-only">
        {statusAnnouncement(state.status, state.error, state.autoStopped, levelPercent)}
      </div>

      {state.status === "denied" || state.status === "unsupported" || state.status === "error" ? (
        <p className="flex max-w-xs items-center gap-2 text-center text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      {state.autoStopped ? (
        <p className="max-w-xs text-center text-xs text-fg-subtle">
          Stopped automatically at the {formatDuration(maxSeconds)} limit.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        {renderControls({ status: state.status, start, pause, resume, stop, retake })}
      </div>
    </div>
  );
}

interface Controls {
  status: RecorderStatus;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  retake: () => void;
}

function renderControls({ status, start, pause, resume, stop, retake }: Controls) {
  switch (status) {
    case "idle":
    case "denied":
    case "unsupported":
    case "error":
      return (
        <IconButton
          label="Start recording"
          icon={
            status === "unsupported" || status === "denied" ? (
              <MicOff className="size-6" />
            ) : (
              <Mic className="size-6" />
            )
          }
          variant="primary"
          size="lg"
          onClick={start}
          disabled={status === "unsupported"}
          className="size-16"
        />
      );
    case "requesting":
      return (
        <IconButton
          label="Waiting for microphone permission"
          icon={<Mic className="size-6 animate-pulse" />}
          variant="primary"
          size="lg"
          loading
          className="size-16"
        />
      );
    case "recording":
      return (
        <>
          <IconButton
            label="Pause recording"
            icon={<Pause className="size-5" />}
            variant="secondary"
            size="lg"
            onClick={pause}
          />
          <IconButton
            label="Stop recording"
            icon={<Square className="size-5 fill-current" />}
            variant="danger"
            size="lg"
            onClick={stop}
            className="size-16"
          />
        </>
      );
    case "paused":
      return (
        <>
          <IconButton
            label="Resume recording"
            icon={<Play className="size-5 translate-x-px" />}
            variant="secondary"
            size="lg"
            onClick={resume}
          />
          <IconButton
            label="Stop recording"
            icon={<Square className="size-5 fill-current" />}
            variant="danger"
            size="lg"
            onClick={stop}
            className="size-16"
          />
        </>
      );
    case "stopped":
      return (
        <Button variant="secondary" leadingIcon={<RotateCcw className="size-4" />} onClick={retake}>
          Retake
        </Button>
      );
    default:
      return null;
  }
}

function statusAnnouncement(
  status: RecorderStatus,
  error: string | null,
  autoStopped: boolean,
  levelPercent: number,
): string {
  switch (status) {
    case "requesting":
      return "Requesting microphone access.";
    case "denied":
      return error ?? "Microphone access was denied.";
    case "unsupported":
      return error ?? "Recording is not supported in this browser.";
    case "error":
      return error ?? "Recording failed.";
    case "recording":
      return autoStopped
        ? "Recording stopped automatically at the maximum length."
        : `Recording, input level ${levelPercent} percent.`;
    case "paused":
      return "Recording paused.";
    case "stopped":
      return "Recording finished. Ready to preview.";
    default:
      return "";
  }
}

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const bars = 20;
  const filled = active ? Math.round(level * bars) : 0;

  return (
    <div
      aria-hidden="true"
      className="flex h-8 items-end gap-[3px]"
    >
      {Array.from({ length: bars }, (_, index) => {
        const isFilled = index < filled;
        const heightPercent = 30 + (index / bars) * 70;
        return (
          <span
            key={index}
            style={{ height: `${heightPercent}%` }}
            className={cn(
              "w-1.5 rounded-full transition-colors duration-100",
              isFilled ? "bg-accent" : "bg-surface-inset",
            )}
          />
        );
      })}
    </div>
  );
}
