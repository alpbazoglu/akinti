"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo } from "react";

import { Waveform } from "@/components/audio";
import { IconButton } from "@/components/ui";
import { Pause, Play } from "@/components/ui/icons";
import { useWaveControls, useWavePlayback } from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

export interface TakeStripProps {
  blob: Blob;
  peaks: readonly number[];
  durationMs: number;
  className?: string;
}

/**
 * The take, shrunk to a 32px strip (`docs/design/SCREENS.md` §4.5).
 *
 * On the details step the trace stops being the subject and becomes a
 * reference: the same drawing at a smaller size, with a round play control and
 * a timecode, so you can check you are writing a title for the right take
 * without leaving the form. Playback still runs through the one global store,
 * like everything else that makes a sound in this product (spec §12).
 */
export function TakeStrip({ blob, peaks, durationMs, className }: TakeStripProps) {
  const t = useTranslations("TakeStrip");
  const generatedId = useId();
  const waveId = `take-strip-${generatedId}`;
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  const playback = useWavePlayback(waveId, durationMs / 1000);
  const { toggle, seekToRatio } = useWaveControls(waveId, url, {
    title: t("yourTake"),
    duration: durationMs / 1000,
    peaks,
  });

  const duration = playback.duration || durationMs / 1000;
  const progress = duration > 0 ? playback.currentTime / duration : 0;

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <IconButton
        label={playback.isPlaying ? t("pauseYourTake") : t("playYourTake")}
        icon={
          playback.isPlaying ? (
            <Pause className="size-4" weight="fill" />
          ) : (
            <Play className="size-4 translate-x-px" weight="fill" />
          )
        }
        variant="primary"
        shape="round"
        size="sm"
        onClick={toggle}
      />
      <Waveform
        peaks={peaks}
        progress={progress}
        duration={duration}
        onSeek={seekToRatio}
        height={32}
        label={t("seekWithinYourTake")}
        className="flex-1"
      />
      <span className="type-mono-sm shrink-0 text-ink-subtle">{formatDuration(duration)}</span>
    </div>
  );
}
