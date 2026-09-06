"use client";

/**
 * The desktop v3 now-playing bar (`docs/design/DESIGN_V3_DESKTOP.md` "Shell":
 * "a fixed 88px full-width now-playing bar replacing the current
 * PersistentPlayer on desktop"). Full page width, fixed to the viewport
 * bottom, visible whenever the single global playback store has a track —
 * `DesktopPlayerStrip` (the column-scoped mini strip) no longer renders at
 * >= 1024px; `AppShell` still mounts `MobilePlayerStrip` unchanged below
 * that width.
 *
 * Reads the same `useActivePlayback`/`usePlaybackStore` surface as every
 * other player UI in the product: still exactly one `<audio>` element, one
 * WaveSurfer instance, one source of truth for what is playing.
 *
 * Transport only offers what the store can actually do. The store holds one
 * track, not a playlist, so there is no real "skip forward", "shuffle" or
 * "repeat" to wire up — inventing buttons for those would be exactly the
 * "fake counts / fake state" DESIGN_V3_DESKTOP.md's "Do not" rules out.
 * "Restart" (seek to 0) is real, so it takes the skip-back glyph's place.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Waveform } from "@/components/audio";
import { Avatar, IconButton, Spinner } from "@/components/ui";
import {
  Handshake,
  Pause,
  Play,
  SkipBack,
  SpeakerHigh,
  SpeakerLow,
  VolumeOff,
} from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { usePlaybackSelector, usePlaybackStore } from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

import { useActivePlayback } from "./PersistentPlayer";

function VolumeControl() {
  const store = usePlaybackStore();
  const volume = usePlaybackSelector((state) => state.volume);
  const muted = usePlaybackSelector((state) => state.muted);
  const t = useTranslations("Terms");
  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeOff : effective < 0.5 ? SpeakerLow : SpeakerHigh;

  return (
    <div className="flex w-28 shrink-0 items-center gap-2">
      <IconButton
        label={t("volume")}
        icon={<Icon className="size-4" aria-hidden="true" />}
        variant="ghost"
        size="sm"
        onClick={() => store.setMuted(!muted)}
        aria-pressed={muted}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={effective}
        aria-label={t("volume")}
        onChange={(event) => {
          const next = Number(event.target.value);
          store.setMuted(false);
          store.setVolume(next);
        }}
        className="h-1 flex-1 cursor-pointer accent-tide"
      />
    </div>
  );
}

export interface NowPlayingBarProps {
  className?: string;
}

export function NowPlayingBar({ className }: NowPlayingBarProps) {
  const playback = useActivePlayback();
  const t = useTranslations("Terms");
  const tLayout = useTranslations("Layout");

  if (!playback) return null;

  const transportLabel = `${playback.isPlaying ? t("pauseAction") : t("playAction")} ${playback.title}`;
  const restartLabel = `${t("seek")} 0:00 — ${playback.title}`;

  return (
    <div
      role="region"
      aria-label={tLayout("nowPlayingBarLabel")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 hidden h-now-playing grid-cols-[280px_1fr_280px] items-center gap-6",
        "border-t border-hairline bg-elevation-0 px-6 shadow-bar lg:grid",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={playback.creatorUsername ?? playback.title} size="lg" />
        <Link
          href={routes.wave(playback.waveId)}
          className="flex min-w-0 flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
        >
          <span className="type-body-sm truncate font-medium text-ink">{playback.title}</span>
          {playback.creatorUsername ? (
            <span className="type-caption truncate text-ink-subtle">@{playback.creatorUsername}</span>
          ) : null}
        </Link>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <IconButton
            label={restartLabel}
            icon={<SkipBack className="size-4" aria-hidden="true" />}
            variant="ghost"
            size="sm"
            onClick={() => playback.seekToRatio(0)}
          />
          <IconButton
            label={transportLabel}
            icon={
              playback.isBusy ? (
                <Spinner size="md" label={null} />
              ) : playback.isPlaying ? (
                <Pause className="size-6" weight="fill" />
              ) : (
                <Play className="size-6 translate-x-px" weight="fill" />
              )
            }
            variant="primary"
            shape="round"
            size="lg"
            onClick={playback.toggle}
          />
          <span aria-hidden="true" className="size-9" />
        </div>
        <div className="flex w-full max-w-lg items-center gap-2">
          <span className="type-mono-sm shrink-0 text-ink-subtle">
            {formatDuration(playback.currentTime)}
          </span>
          <Waveform
            peaks={playback.peaks}
            progress={playback.progress}
            loaded={playback.buffered}
            duration={playback.duration}
            onSeek={playback.seekToRatio}
            height={28}
            label={playback.title}
          />
          <span className="type-mono-sm shrink-0 text-ink-subtle">
            {formatDuration(playback.duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-5">
        <Link
          href={routes.waveDuet(playback.waveId)}
          className={cn(
            "akinti-press inline-flex h-9 shrink-0 items-center gap-2 rounded-key border border-hairline-strong px-3",
            "type-caption-strong text-ink transition-colors hover:bg-elevation-2",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
          )}
        >
          <Handshake className="size-4" aria-hidden="true" />
          {t("duet")}
        </Link>
        <VolumeControl />
      </div>
    </div>
  );
}
