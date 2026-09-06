"use client";

import { useTranslations } from "next-intl";
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
import { useStageShortcuts } from "./useStageShortcuts";

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
  const t = useTranslations("ReviewStage");
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
    title: t("yourTake"),
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

  // "space = arm/stop" only makes literal sense on `RecordStage`; here the
  // equivalent transport is play/pause on the already-captured take, so
  // space previews it instead. "R = retake" and "Enter = continue" map
  // directly onto this screen's own two actions below.
  useStageShortcuts({ onSpace: toggle, onRetake, onContinue });

  return (
    <section className={cn("flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="-mx-page lg:mx-0">
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
              label={t("traceNotAvailable")}
            />
          )}
        </div>
        {!tracePrepared ? (
          <p className="type-body-sm measure text-ink-muted">{t("couldNotPrepareTraceTrim")}</p>
        ) : null}

        <div className="type-mono-sm flex items-center justify-between text-ink-subtle">
          <span>{formatDuration(playback.isActive ? playback.currentTime : 0)}</span>
          <span>{formatDuration(duration)}</span>
        </div>

        <div className="flex items-center gap-6">
          <IconButton
            label={t("back15Seconds")}
            icon={<SkipBack className="size-5" />}
            variant="secondary"
            shape="round"
            size="md"
            onClick={() => seek(Math.max(0, playback.currentTime - 15))}
          />
          <IconButton
            label={playback.isPlaying ? t("pauseYourTake") : t("playYourTake")}
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
            label={t("forward15Seconds")}
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
              <p className="type-caption-strong text-ink-muted">{t("trim")}</p>
              {trimmed ? (
                <Button variant="ghost" size="xs" onClick={() => onRangeChange(fullRange(durationMs))}>
                  {t("useWholeTake")}
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
          <p className="type-body-sm measure text-ink-muted">{t("interruptedDescription")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:w-[280px] lg:shrink-0">
        <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-stretch">
          <Button size="lg" onClick={onContinue}>
            {t("continueAction")}
          </Button>
          <Button variant="ghost" onClick={onRetake}>
            {t("reRecord")}
          </Button>
        </div>
        <div className="hidden flex-col gap-1.5 border-t border-hairline pt-4 lg:flex">
          <p className="type-caption flex items-center gap-1.5 text-ink-subtle">
            <kbd className="rounded-label border border-hairline-strong bg-elevation-2 px-1.5 py-0.5 type-mono-sm">
              {t("enterKey")}
            </kbd>
            {t("enterToContinueHint")}
          </p>
          <p className="type-caption flex items-center gap-1.5 text-ink-subtle">
            <kbd className="rounded-label border border-hairline-strong bg-elevation-2 px-1.5 py-0.5 type-mono-sm">
              {t("rKey")}
            </kbd>
            {t("rToRetakeHint")}
          </p>
        </div>
      </div>
    </section>
  );
}
