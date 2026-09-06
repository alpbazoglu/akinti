"use client";

/**
 * A backing track, as a desktop card (this pass's brief, item 2: "backing-
 * track library as a filterable card grid — genre, BPM, key chips with
 * icons, hover play, 'Sing over this' primary action"). Sibling of
 * `ExploreWaveCard` and `BackingTracksLane`'s own `TrackRow` rather than a
 * variant of either — same audio wiring (`useSignedAudio`, the global
 * `usePlaybackStore`/`useWavePlayback`) as `TrackRow`, same hover-reveal play
 * button and genre tint as `ExploreWaveCard`, reshaped into a bounded card
 * because a grid (unlike a lane or a stream row) needs one.
 */

import { useTranslations } from "next-intl";

import { WaveformCanvas } from "@/components/audio";
import { genreHueForTag, useSignedAudio, type BackingTrackCard } from "@/components/feed";
import { Clock, MusicNotes, Pause, Play } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { usePlaybackStore, useWavePlayback } from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

export interface TrackCardProps {
  track: BackingTrackCard;
}

export function TrackCard({ track }: TrackCardProps) {
  const t = useTranslations("TrackCard");
  const store = usePlaybackStore();
  const playbackId = `track:${track.id}`;
  const playback = useWavePlayback(playbackId, track.durationSeconds ?? 0);
  const audio = useSignedAudio(track.audioAssetId);

  const duration = playback.duration || track.durationSeconds || 0;
  const progress = duration > 0 ? playback.currentTime / duration : 0;
  const isPlaying = playback.isActive && playback.isPlaying;
  const hue = genreHueForTag(track.genreTags[0] ?? null);

  const toggle = () => {
    if (playback.isPlaying) {
      store.pause();
      return;
    }
    if (playback.isActive && audio.url) {
      store.resume();
      return;
    }
    void audio.resolve().then((url) => {
      if (!url) return;
      store.play(playbackId, url, {
        title: track.title,
        creatorUsername: track.artistCredit,
        duration: track.durationSeconds,
        peaks: track.peaks,
      });
    });
  };

  const meta = [track.bpm ? t("bpm", { bpm: track.bpm }) : null, track.musicalKey, duration > 0 ? formatDuration(duration) : null].filter(
    (value): value is string => Boolean(value),
  );

  return (
    <article className="group flex flex-col gap-3 rounded-card border border-hairline bg-elevation-2 p-4 transition-[transform,box-shadow,border-color] duration-150 ease-[--ease-enter] hover:-translate-y-1 hover:border-hairline-strong hover:shadow-lift">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="type-subhead truncate text-ink">{track.title}</p>
        <p className="type-caption truncate text-ink-subtle">{track.artistCredit}</p>
      </div>

      <div className="relative flex h-16 items-center rounded-key bg-elevation-1">
        <WaveformCanvas
          peaks={playback.peaks ?? track.peaks}
          progress={progress}
          loaded={playback.isActive ? playback.buffered : 1}
          state={isPlaying ? "playing" : "unplayed"}
          hue={hue}
          height={64}
        />
        <button
          type="button"
          aria-label={isPlaying ? t("pause", { title: track.title }) : t("play", { title: track.title })}
          onClick={toggle}
          className={cn(
            "akinti-press absolute inset-0 m-auto flex size-11 items-center justify-center rounded-full bg-tide text-on-ink transition-opacity duration-150",
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
            isPlaying && "opacity-100",
          )}
        >
          {isPlaying ? <Pause className="size-5" weight="fill" /> : <Play className="size-5 translate-x-px" weight="fill" />}
        </button>
      </div>

      {audio.error ? <p role="alert" className="type-caption text-signal-deep">{audio.error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        {track.genreTags[0] ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-tag border border-hairline px-2.5 type-caption text-ink-muted">
            <MusicNotes className="size-3.5" aria-hidden="true" />
            {track.genreTags[0]}
          </span>
        ) : null}
        {meta.length > 0 ? (
          <span className="type-caption flex items-center gap-1.5 text-ink-subtle">
            <Clock className="size-3.5" aria-hidden="true" />
            {meta.join(" · ")}
          </span>
        ) : null}
      </div>

      <a
        href={`${routes.create()}?track=${encodeURIComponent(track.id)}`}
        className="akinti-press inline-flex h-9 items-center justify-center rounded-key bg-tide type-body-sm font-medium text-on-ink transition-colors hover:bg-tide-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
      >
        {t("singOverThis")}
      </a>
    </article>
  );
}
