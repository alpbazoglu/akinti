"use client";

import { useEffect } from "react";

import {
  useWaveControls,
  useWavePlayback,
  usePlaybackStore,
  type PlaybackEndedEvent,
  type PlaybackProgressEvent,
} from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";
import { IconButton, Spinner } from "@/components/ui";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "@/components/ui/icons";

import { Waveform } from "./Waveform";

/**
 * Three sizes, one drawing (§8.4).
 *
 *  - `inline`  a 56px trace in a stream, with the transport beside it
 *  - `detail`  a 144px trace bleeding past both page edges, with
 *              back 15 / play / forward 15 at 44/56/44px and a speed readout
 *  - `compact` a 32px trace for a message row or a comment
 */
export type WavePlayerVariant = "inline" | "detail" | "compact" | "default";

export interface WavePlayerProps {
  waveId: string;
  /** Audio source URL. Signed URLs are resolved by the caller. */
  src: string;
  /** Real peaks from the asset. A placeholder shape only while processing. */
  peaks: readonly number[];
  /** Known duration in seconds; the real one replaces it once metadata loads. */
  duration?: number;
  title?: string;
  creatorUsername?: string;
  /**
   * Raw playback ticks for this Wave. This component does not count Plays —
   * a metrics layer decides what counts.
   */
  onProgress?: (event: PlaybackProgressEvent) => void;
  /** Raw completion event for this Wave. */
  onEnded?: (event: PlaybackEndedEvent) => void;
  variant?: WavePlayerVariant;
  /** Applies the 24px edge fade for a trace that bleeds past the page edges. */
  fullBleed?: boolean;
  className?: string;
}

const TRACE_HEIGHT: Record<Exclude<WavePlayerVariant, "default">, number> = {
  inline: 56,
  detail: 144,
  compact: 32,
};

/**
 * The transport plus the trace, driven entirely by the global playback store:
 * only one Wave can be playing anywhere in the app.
 *
 * The trace is the scrubber and the largest target on the row; the explicit
 * play control exists for accessibility and for reaching play without
 * scrubbing (§8.3, §12.10). Nothing here is a slider with a filled track.
 */
export function WavePlayer({
  waveId,
  src,
  peaks,
  duration: initialDuration = 0,
  title,
  creatorUsername,
  onProgress,
  onEnded,
  variant = "inline",
  fullBleed = false,
  className,
}: WavePlayerProps) {
  const store = usePlaybackStore();
  const playback = useWavePlayback(waveId, initialDuration);
  const { toggle, seekToRatio, seek, play } = useWaveControls(waveId, src, {
    title,
    creatorUsername,
    duration: initialDuration,
    peaks,
  });

  useEffect(() => {
    if (!onProgress) return;
    return store.onProgress((event) => {
      if (event.waveId === waveId) onProgress(event);
    });
  }, [store, waveId, onProgress]);

  useEffect(() => {
    if (!onEnded) return;
    return store.onEnded((event) => {
      if (event.waveId === waveId) onEnded(event);
    });
  }, [store, waveId, onEnded]);

  const size = variant === "default" ? "inline" : variant;
  const duration = playback.duration || initialDuration;
  const ratio = duration > 0 ? playback.currentTime / duration : 0;
  const compact = size === "compact";
  const detail = size === "detail";
  const hasError = playback.status === "error";

  // Real peaks from the asset win; the store's decoded peaks replace a
  // placeholder the moment the audio itself can tell us the shape.
  const trace = playback.peaks ?? peaks;

  const accessibleName = title
    ? `${playback.isPlaying ? "Pause" : "Play"} ${title}`
    : playback.isPlaying
      ? "Pause"
      : "Play";

  const transport = hasError ? (
    <IconButton
      label="Retry playback"
      icon={<RotateCcw className={compact ? "size-4" : "size-6"} />}
      variant="secondary"
      shape="round"
      size={compact ? "sm" : "lg"}
      onClick={play}
    />
  ) : (
    <IconButton
      label={accessibleName}
      icon={
        playback.isBusy ? (
          <Spinner size={compact ? "sm" : "md"} label={null} />
        ) : playback.isPlaying ? (
          <Pause className={compact ? "size-4" : "size-6"} weight="fill" />
        ) : (
          <Play className={cn(compact ? "size-4" : "size-6", "translate-x-px")} weight="fill" />
        )
      }
      variant="primary"
      shape="round"
      size={compact ? "sm" : "lg"}
      onClick={toggle}
    />
  );

  const traceNode = (
    <Waveform
      peaks={trace}
      progress={ratio}
      loaded={playback.buffered}
      duration={duration}
      onSeek={seekToRatio}
      height={TRACE_HEIGHT[size]}
      label={title ? `Seek within ${title}` : "Seek"}
      disabled={hasError}
      fullBleed={fullBleed}
      className={detail ? undefined : "flex-1"}
    />
  );

  const timecodes = (
    <div className="type-mono-sm flex items-center justify-between text-ink-subtle">
      <span>{formatDuration(playback.isActive ? playback.currentTime : 0)}</span>
      <span
        aria-live="polite"
        className={cn("px-2 text-center", hasError ? "text-signal-deep" : "sr-only")}
      >
        {hasError ? playback.error : statusText(playback.status)}
      </span>
      <span>{formatDuration(duration)}</span>
    </div>
  );

  if (detail) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        {traceNode}
        {timecodes}
        <div className="flex items-center justify-center gap-6">
          <IconButton
            label="Back 15 seconds"
            icon={<SkipBack className="size-5" />}
            variant="secondary"
            shape="round"
            size="md"
            onClick={() => seek(Math.max(0, playback.currentTime - 15))}
          />
          {transport}
          <IconButton
            label="Forward 15 seconds"
            icon={<SkipForward className="size-5" />}
            variant="secondary"
            shape="round"
            size="md"
            onClick={() => seek(playback.currentTime + 15)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-4">
        {transport}
        {traceNode}
      </div>
      {timecodes}
    </div>
  );
}

function statusText(status: string): string {
  switch (status) {
    case "loading":
      return "Loading audio";
    case "buffering":
      return "Buffering";
    case "playing":
      return "Playing";
    case "paused":
      return "Paused";
    case "ended":
      return "Finished";
    default:
      return "";
  }
}
