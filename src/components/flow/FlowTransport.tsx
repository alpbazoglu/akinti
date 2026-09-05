"use client";

import { WaveformCanvas } from "@/components/audio";
import { Pause, Play } from "@/components/ui/icons";
import { formatDuration } from "@/lib/ui";

export interface FlowTransportProps {
  isPlaying: boolean;
  hasStarted: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
  /** The next Wave's peaks, drawn faint and unplayed (`docs/FLOW.md` "up next hairline strip"). `null` when this is the last loaded Wave. */
  upNextPeaks: readonly number[] | null;
}

/**
 * The bottom transport (`docs/FLOW.md`): play/pause is the largest touch
 * target on the screen (`docs/design/DESIGN.md` "Transport controls ... are
 * the largest touch targets on their screen") — 72px, larger than every
 * rail key — plus the elapsed/duration readout in Martian Mono and a faint
 * hairline trace of what's up next.
 */
export function FlowTransport({ isPlaying, hasStarted, currentTime, duration, onToggle, upNextPeaks }: FlowTransportProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label={hasStarted ? (isPlaying ? "Pause" : "Play") : "Tap to start listening"}
        onClick={onToggle}
        className="akinti-press flex size-[4.5rem] items-center justify-center rounded-full bg-tide text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
      >
        {isPlaying ? <Pause className="size-8" weight="fill" /> : <Play className="size-8" weight="fill" />}
      </button>

      <p className="type-mono-sm text-ink-subtle">
        {formatDuration(currentTime)} <span aria-hidden="true">/</span> {formatDuration(duration)}
      </p>

      {upNextPeaks ? (
        <div className="w-full opacity-40">
          <WaveformCanvas peaks={upNextPeaks} state="unplayed" height={20} />
        </div>
      ) : null}
    </div>
  );
}
