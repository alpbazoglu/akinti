"use client";

import Link from "next/link";

import { Waveform } from "@/components/audio";
import { IconButton, Spinner } from "@/components/ui";
import { Pause, Play, RotateCcw } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { usePlaybackStore, useWavePlayback } from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

import { useSignedAudio } from "./signedAudio";

export interface TraceRowWave {
  readonly id: string;
  readonly title: string;
  readonly audioAssetId: string;
  readonly peaks: readonly number[];
  readonly duration?: number;
  readonly creator: {
    readonly username: string;
    readonly displayName?: string;
  };
}

export interface TraceRowProps {
  wave: TraceRowWave;
  className?: string;
}

/**
 * A Wave reduced to what it actually is: a trace and a name (§8.14).
 *
 * This is the row an empty state is built from. "An empty state should
 * contain the thing it is describing, if that is possible" — so Home with no
 * follows shows three real Waves playing rather than an icon in a grey circle
 * above centred text (§12.5). It is hung on the same 44px rail as everything
 * else, and the trace is the largest thing in the row.
 */
export function TraceRow({ wave, className }: TraceRowProps) {
  const store = usePlaybackStore();
  const playback = useWavePlayback(wave.id, wave.duration ?? 0);
  const audio = useSignedAudio(wave.audioAssetId);

  const creatorName = wave.creator.displayName ?? wave.creator.username;
  const duration = playback.duration || wave.duration || 0;
  const ratio = duration > 0 ? playback.currentTime / duration : 0;
  const failed = playback.status === "error" || audio.error !== null;

  const start = (fromRatio?: number) => {
    void audio.resolve().then((url) => {
      if (!url) return;
      store.play(wave.id, url, {
        title: wave.title,
        creatorUsername: wave.creator.username,
        duration: wave.duration,
        peaks: wave.peaks,
      });
      if (fromRatio !== undefined) {
        store.seekToRatio(fromRatio);
      }
    });
  };

  const toggle = () => {
    if (playback.isPlaying) {
      store.pause();
      return;
    }
    if (playback.isActive && audio.url) {
      store.resume();
      return;
    }
    start();
  };

  return (
    <div className={cn("akinti-rail py-3", className)}>
      <div className="flex justify-start">
        <IconButton
          label={
            failed
              ? `Retry ${wave.title}`
              : playback.isPlaying
                ? `Pause ${wave.title}`
                : `Play ${wave.title}`
          }
          icon={
            failed ? (
              <RotateCcw className="size-5" />
            ) : playback.isBusy ? (
              <Spinner size="sm" label={null} />
            ) : playback.isPlaying ? (
              <Pause className="size-5" weight="fill" />
            ) : (
              <Play className="size-5 translate-x-px" weight="fill" />
            )
          }
          variant="primary"
          shape="round"
          size="md"
          onClick={toggle}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="type-caption truncate text-ink-subtle">
          <Link
            href={routes.wave(wave.id)}
            className="type-subhead text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {wave.title}
          </Link>
          <span aria-hidden="true"> &middot; </span>
          {creatorName}
        </p>

        <div className="flex items-center gap-3">
          <Waveform
            peaks={playback.peaks ?? wave.peaks}
            progress={ratio}
            loaded={playback.buffered}
            duration={duration}
            height={28}
            label={`Seek within ${wave.title}`}
            disabled={failed}
            onSeek={(next) => {
              if (playback.isActive && audio.url) {
                store.seekToRatio(next);
                return;
              }
              start(next);
            }}
            className="min-w-0 flex-1"
          />
          <span className="type-mono-sm shrink-0 text-ink-subtle">
            {formatDuration(playback.isActive ? playback.currentTime : duration)}
          </span>
        </div>

        {audio.error ? (
          <p role="alert" className="type-caption text-signal-deep">
            {audio.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
