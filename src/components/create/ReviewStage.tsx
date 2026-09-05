"use client";

import { useEffect, useId, useMemo } from "react";

import { Waveform } from "@/components/audio";
import { Button, IconButton } from "@/components/ui";
import { Pause, Play, SkipBack, SkipForward } from "@/components/ui/icons";
import {
  fullRange,
  isTrimmed,
  trimmedDurationMs,
  useWaveControls,
  useWavePlayback,
  type TrimRange,
} from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

import { TrimTrace } from "./TrimTrace";

export interface ReviewStageProps {
  blob: Blob;
  durationMs: number;
  peaks: readonly number[];
  range: TrimRange;
  onRangeChange: (range: TrimRange) => void;
  onContinue: () => void;
  onRetake: () => void;
  /** Set when the take ended because the tab was hidden rather than by choice. */
  interrupted?: boolean;
  className?: string;
}

/**
 * Review (`docs/design/SCREENS.md` §4.3).
 *
 * The take, full-bleed at 96px, with two trim handles and the transport
 * underneath at 44/56/44. Playback runs through the global store like every
 * other sound in this product — there is exactly one `<audio>` and one Wave
 * playing anywhere (spec §12), and a local preview is not an exception to
 * that.
 *
 * "Re-record" is a text key, not a second filled key beside Continue: two
 * calls to action that look equally important on one screen is what makes a
 * flow feel undesigned (§12.40, §8.7).
 */
export function ReviewStage({
  blob,
  durationMs,
  peaks,
  range,
  onRangeChange,
  onContinue,
  onRetake,
  interrupted = false,
  className,
}: ReviewStageProps) {
  const generatedId = useId();
  const waveId = `take-${generatedId}`;
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  const playback = useWavePlayback(waveId, durationMs / 1000);
  const { toggle, seekToRatio, seek } = useWaveControls(waveId, url, {
    title: "Your take",
    duration: durationMs / 1000,
    peaks,
  });

  const duration = playback.duration || durationMs / 1000;
  const progress = duration > 0 ? playback.currentTime / duration : 0;
  const trimmed = isTrimmed(range, durationMs);
  // A real decode failure, not a placeholder: never invent a shape for the
  // trace, and never let the singer trim blind against amplitudes that are
  // not their own recording (DESIGN.md §12.32).
  const tracePrepared = peaks.length > 0;

  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <div className="-mx-page">
        {tracePrepared ? (
          <TrimTrace
            peaks={peaks}
            durationMs={durationMs}
            range={range}
            onRangeChange={onRangeChange}
            progress={progress}
            onSeek={seekToRatio}
          />
        ) : (
          <Waveform
            peaks={[]}
            state="dormant"
            height={96}
            readOnly
            fullBleed
            label="Trace not available"
          />
        )}
      </div>
      {!tracePrepared ? (
        <p className="type-body-sm measure text-ink-muted">
          We couldn&apos;t prepare a trace for this take, so trimming is off for now. Continue
          with the whole recording, or record it again.
        </p>
      ) : null}

      <div className="type-mono-sm flex items-center justify-between text-ink-subtle">
        <span>{formatDuration(playback.isActive ? playback.currentTime : 0)}</span>
        <span>{formatDuration(duration)}</span>
      </div>

      <div className="flex items-center gap-6">
        <IconButton
          label="Back 15 seconds"
          icon={<SkipBack className="size-5" />}
          variant="secondary"
          shape="round"
          size="md"
          onClick={() => seek(Math.max(0, playback.currentTime - 15))}
        />
        <IconButton
          label={playback.isPlaying ? "Pause your take" : "Play your take"}
          icon={
            playback.isPlaying ? (
              <Pause className="size-6" weight="fill" />
            ) : (
              <Play className="size-6 translate-x-px" weight="fill" />
            )
          }
          variant="primary"
          shape="round"
          size="lg"
          onClick={toggle}
        />
        <IconButton
          label="Forward 15 seconds"
          icon={<SkipForward className="size-5" />}
          variant="secondary"
          shape="round"
          size="md"
          onClick={() => seek(playback.currentTime + 15)}
        />
      </div>

      {tracePrepared ? (
        <div className="flex flex-col gap-2 border-t border-hairline pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="type-caption-strong text-ink-muted">Trim</p>
            {trimmed ? (
              <Button variant="ghost" size="xs" onClick={() => onRangeChange(fullRange(durationMs))}>
                Use the whole take
              </Button>
            ) : null}
          </div>
          <div className="type-mono-sm flex items-center justify-between text-ink-subtle">
            <span>{formatDuration(range.startMs / 1000)}</span>
            <span className="text-ink">{formatDuration(trimmedDurationMs(range) / 1000)}</span>
            <span>{formatDuration(range.endMs / 1000)}</span>
          </div>
        </div>
      ) : null}

      {interrupted ? (
        <p className="type-body-sm measure text-ink-muted">
          Recording stopped when you left the page. Everything up to that point is here.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <Button size="lg" onClick={onContinue}>
          Continue
        </Button>
        <Button variant="ghost" onClick={onRetake}>
          Re-record
        </Button>
      </div>
    </section>
  );
}
