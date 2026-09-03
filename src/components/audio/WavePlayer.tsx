"use client";

import { useEffect } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

import {
  useWaveControls,
  useWavePlayback,
  usePlaybackStore,
  type PlaybackEndedEvent,
  type PlaybackProgressEvent,
} from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";
import { IconButton, Spinner } from "@/components/ui";

import { Waveform, type WaveformVariant } from "./Waveform";

export interface WavePlayerProps {
  waveId: string;
  /** Audio source URL. Signed URLs are resolved by the caller. */
  src: string;
  peaks: readonly number[];
  /** Known duration in seconds; the real one replaces it once metadata loads. */
  duration?: number;
  title?: string;
  creatorUsername?: string;
  /**
   * Raw playback ticks for this Wave. This component does not count Plays —
   * a metrics layer decides what counts (spec section 13).
   */
  onProgress?: (event: PlaybackProgressEvent) => void;
  /** Raw completion event for this Wave. */
  onEnded?: (event: PlaybackEndedEvent) => void;
  variant?: "default" | "compact";
  waveformVariant?: WaveformVariant;
  className?: string;
}

/**
 * Transport controls plus the waveform, driven entirely by the global playback
 * store: only one Wave can be playing anywhere in the app (spec section 12).
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
  variant = "default",
  waveformVariant = "bars",
  className,
}: WavePlayerProps) {
  const store = usePlaybackStore();
  const playback = useWavePlayback(waveId, initialDuration);
  const { toggle, seekToRatio, play } = useWaveControls(waveId, src, {
    title,
    creatorUsername,
    duration: initialDuration,
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

  const duration = playback.duration || initialDuration;
  const ratio = duration > 0 ? playback.currentTime / duration : 0;
  const compact = variant === "compact";
  const hasError = playback.status === "error";

  const accessibleName = title
    ? `${playback.isPlaying ? "Pause" : "Play"} ${title}`
    : playback.isPlaying
      ? "Pause"
      : "Play";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-3">
        {hasError ? (
          <IconButton
            label="Retry playback"
            icon={<RotateCcw className={compact ? "size-4" : "size-5"} />}
            variant="secondary"
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
                <Pause className={compact ? "size-4" : "size-5"} />
              ) : (
                <Play className={cn(compact ? "size-4" : "size-5", "translate-x-px")} />
              )
            }
            variant="primary"
            size={compact ? "sm" : "lg"}
            onClick={toggle}
          />
        )}

        <Waveform
          peaks={peaks}
          progress={ratio}
          duration={duration}
          onSeek={seekToRatio}
          variant={waveformVariant}
          height={compact ? 32 : 52}
          label={title ? `Seek within ${title}` : "Seek"}
          disabled={hasError}
          className="flex-1"
        />
      </div>

      <div className="flex items-center justify-between pl-1 text-xs tabular-nums text-fg-subtle">
        <span>{formatDuration(playback.isActive ? playback.currentTime : 0)}</span>
        <span
          aria-live="polite"
          className={cn("px-2 text-center", hasError ? "text-danger" : "sr-only")}
        >
          {hasError ? playback.error : statusText(playback.status)}
        </span>
        <span>{formatDuration(duration)}</span>
      </div>
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
