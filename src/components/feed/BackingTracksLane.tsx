"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Waveform } from "@/components/audio";
import { Chip, IconButton, Spinner } from "@/components/ui";
import { Pause, Play, RotateCcw } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { usePlaybackStore, useWavePlayback } from "@/lib/audio";
import { formatDuration } from "@/lib/ui";

import { useSignedAudio } from "./signedAudio";

export interface BackingTrackCard {
  readonly id: string;
  readonly title: string;
  readonly artistCredit: string;
  readonly sourceUrl: string | null;
  readonly audioAssetId: string;
  readonly peaks: readonly number[];
  readonly durationSeconds?: number;
  readonly bpm: number | null;
  readonly musicalKey: string | null;
  readonly genreTags: readonly string[];
}

export interface BackingTracksLaneProps {
  tracks: readonly BackingTrackCard[];
}

/** The genres actually present in the tracks on screen, most common first. */
function genresOf(tracks: readonly BackingTrackCard[]): string[] {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    for (const tag of track.genreTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/**
 * Tracks to sing over (SCREENS.md §3, PRODUCT_V2 §4).
 *
 * A curated, licence-clear instrumental library. Each row plays where it
 * stands so the choice is made by ear, not by reading a title, and every
 * track carries its own attribution because the licence requires it.
 *
 * The genre row is chips, not pills: 6px-radius hairline tags, with the
 * active one marked by a 2px ink underbar (§8.8, §12.4). The chips list only
 * genres that are actually on this screen.
 */
export function BackingTracksLane({ tracks }: BackingTracksLaneProps) {
  const t = useTranslations("BackingTracksLane");
  const [genre, setGenre] = useState<string | null>(null);
  const genres = useMemo(() => genresOf(tracks), [tracks]);
  const shown = useMemo(
    () => (genre ? tracks.filter((track) => track.genreTags.includes(genre)) : tracks),
    [genre, tracks],
  );

  if (tracks.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="backing-tracks" className="flex flex-col gap-4 pt-8">
      <h2 id="backing-tracks" className="akinti-page type-caption-strong text-ink-muted">
        {t("title")}
      </h2>

      {genres.length > 1 ? (
        <div
          role="group"
          aria-label={t("filterByGenre")}
          className="akinti-page flex gap-2 overflow-x-auto pb-1"
        >
          <Chip selected={genre === null} onClick={() => setGenre(null)}>
            {t("all")}
          </Chip>
          {genres.map((tag) => (
            <Chip key={tag} selected={genre === tag} onClick={() => setGenre(tag)}>
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="akinti-page flex flex-col">
        {shown.map((track) => (
          <TrackRow key={track.id} track={track} />
        ))}
      </div>
    </section>
  );
}

function TrackRow({ track }: { track: BackingTrackCard }) {
  const t = useTranslations("BackingTracksLane");
  const store = usePlaybackStore();
  const playbackId = `track:${track.id}`;
  const playback = useWavePlayback(playbackId, track.durationSeconds ?? 0);
  const audio = useSignedAudio(track.audioAssetId);

  const duration = playback.duration || track.durationSeconds || 0;
  const ratio = duration > 0 ? playback.currentTime / duration : 0;
  const failed = playback.status === "error" || audio.error !== null;

  const start = (fromRatio?: number) => {
    void audio.resolve().then((url) => {
      if (!url) return;
      store.play(playbackId, url, {
        title: track.title,
        creatorUsername: track.artistCredit,
        duration: track.durationSeconds,
        peaks: track.peaks,
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

  const meta = [
    track.bpm ? `${track.bpm} bpm` : null,
    track.musicalKey,
    duration > 0 ? formatDuration(duration) : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="akinti-rail border-b border-hairline py-4 last:border-b-0">
      <div className="flex justify-start">
        <IconButton
          label={
            failed
              ? t("retry", { title: track.title })
              : playback.isPlaying
                ? t("pause", { title: track.title })
                : t("play", { title: track.title })
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
          variant="secondary"
          shape="round"
          size="md"
          onClick={toggle}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className="type-subhead truncate text-ink">{track.title}</p>
          <span className="type-mono-sm shrink-0 text-ink-subtle">
            {meta.join(" \u00b7 ")}
          </span>
        </div>

        <Waveform
          peaks={playback.peaks ?? track.peaks}
          progress={ratio}
          loaded={playback.buffered}
          duration={duration}
          height={28}
          label={t("seekWithin", { title: track.title })}
          disabled={failed}
          onSeek={(next) => {
            if (playback.isActive && audio.url) {
              store.seekToRatio(next);
              return;
            }
            start(next);
          }}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="type-caption text-ink-subtle">
            {track.sourceUrl ? (
              <a
                href={track.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-ink-muted underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink"
              >
                {track.artistCredit}
              </a>
            ) : (
              track.artistCredit
            )}
          </p>
          <Link
            href={`${routes.create()}?track=${encodeURIComponent(track.id)}`}
            className="type-caption text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            {t("singOverThis")}
          </Link>
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
