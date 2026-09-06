"use client";

/**
 * `/tracks`, desktop path (this pass's brief, item 2: "backing-track library
 * as a filterable card grid — genre, BPM, key chips with icons"). Mobile
 * keeps the existing `BackingTracksLane` teaser-lane shape entirely
 * unchanged; this only mounts at `lg`, picked once via `useIsDesktopViewport`
 * the same way every other desktop grid in this pass is (`WaveFeedList`,
 * `ChallengeWaveGrid`) rather than a CSS-hidden duplicate — each `TrackCard`
 * carries its own audio hooks.
 *
 * Filter options are derived from the tracks actually on screen (like
 * `BackingTracksLane`'s own genre chips) — a BPM bucket or a key only
 * appears as a chip when at least one loaded track has it, never a fixed
 * list of options that might all be empty.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Chip } from "@/components/ui";
import type { BackingTrackCard } from "@/components/feed";

import { TrackCard } from "./TrackCard";

export interface TracksLibraryGridProps {
  tracks: readonly BackingTrackCard[];
}

type BpmBucket = "under90" | "90to119" | "120to139" | "140plus";

const BPM_BUCKET_ORDER: readonly BpmBucket[] = ["under90", "90to119", "120to139", "140plus"];

function bpmBucketOf(bpm: number | null): BpmBucket | null {
  if (bpm === null) return null;
  if (bpm < 90) return "under90";
  if (bpm < 120) return "90to119";
  if (bpm < 140) return "120to139";
  return "140plus";
}

function uniqueSorted(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
}

export function TracksLibraryGrid({ tracks }: TracksLibraryGridProps) {
  const t = useTranslations("TracksLibraryGrid");
  const [genre, setGenre] = useState<string | null>(null);
  const [bpmBucket, setBpmBucket] = useState<BpmBucket | null>(null);
  const [key, setKey] = useState<string | null>(null);

  const genres = useMemo(() => uniqueSorted(tracks.flatMap((track) => track.genreTags)), [tracks]);
  const bpmBuckets = useMemo(
    () => BPM_BUCKET_ORDER.filter((bucket) => tracks.some((track) => bpmBucketOf(track.bpm) === bucket)),
    [tracks],
  );
  const keys = useMemo(() => uniqueSorted(tracks.map((track) => track.musicalKey)), [tracks]);

  const filtered = useMemo(
    () =>
      tracks.filter((track) => {
        if (genre && !track.genreTags.includes(genre)) return false;
        if (bpmBucket && bpmBucketOf(track.bpm) !== bpmBucket) return false;
        if (key && track.musicalKey !== key) return false;
        return true;
      }),
    [tracks, genre, bpmBucket, key],
  );

  const bpmBucketLabel: Record<BpmBucket, string> = {
    under90: t("bpmUnder90"),
    "90to119": t("bpm90to119"),
    "120to139": t("bpm120to139"),
    "140plus": t("bpm140plus"),
  };

  return (
    <div className="akinti-page flex flex-col gap-5 pb-16">
      <div className="flex flex-col gap-3">
        {genres.length > 1 ? (
          <div role="group" aria-label={t("filterByGenre")} className="flex flex-wrap gap-2">
            <Chip selected={genre === null} onClick={() => setGenre(null)}>
              {t("allGenres")}
            </Chip>
            {genres.map((tag) => (
              <Chip key={tag} selected={genre === tag} onClick={() => setGenre(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        ) : null}
        {bpmBuckets.length > 1 ? (
          <div role="group" aria-label={t("filterByBpm")} className="flex flex-wrap gap-2">
            <Chip selected={bpmBucket === null} onClick={() => setBpmBucket(null)}>
              {t("allTempos")}
            </Chip>
            {bpmBuckets.map((bucket) => (
              <Chip key={bucket} selected={bpmBucket === bucket} onClick={() => setBpmBucket(bucket)}>
                {bpmBucketLabel[bucket]}
              </Chip>
            ))}
          </div>
        ) : null}
        {keys.length > 1 ? (
          <div role="group" aria-label={t("filterByKey")} className="flex flex-wrap gap-2">
            <Chip selected={key === null} onClick={() => setKey(null)}>
              {t("allKeys")}
            </Chip>
            {keys.map((musicalKey) => (
              <Chip key={musicalKey} selected={key === musicalKey} onClick={() => setKey(musicalKey)}>
                {musicalKey}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t("noMatch")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {filtered.map((track) => (
            <TrackCard key={track.id} track={track} />
          ))}
        </div>
      )}
    </div>
  );
}
