"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useOptimistic, useState, useTransition } from "react";

import { saveWave, unsaveWave } from "@/app/(app)/w/[id]/interactions";
import { WaveformCanvas } from "@/components/audio";
import { Avatar, Badge, useActionToast } from "@/components/ui";
import { Bookmark, MessageSquare, Pause, Play, Share2 } from "@/components/ui/icons";
import { CREATION_TYPES, METRICS } from "@/config/terminology";
import { routes } from "@/config/routes";
import { usePlaybackStore, useWavePlayback } from "@/lib/audio";
import { emitAnalyticsEvent } from "@/lib/metrics";
import { cn, formatCount, timeAgo } from "@/lib/ui";

import { genreHueForTag } from "./genreHue";
import { useSignedAudio } from "./signedAudio";
import type { WaveCardContainerWave } from "@/components/wave";

const ShareSheet = dynamic(() => import("@/components/share").then((mod) => mod.ShareSheet));

export interface ExploreWaveCardProps {
  wave: WaveCardContainerWave;
  unheard?: boolean;
}

const METRIC_LABEL_KEY = {
  plays: "metricPlays",
  replays: "metricReplays",
  comments: "metricComments",
  saves: "metricSaves",
  shares: "metricShares",
  duets: "metricDuets",
} as const;

/**
 * The Explore desktop card (`DESIGN_V3_DESKTOP.md`: "Cards are allowed on
 * desktop grids [...] Explore"; the brief's "4-5 columns at 1440, hover-lift
 * with play button reveal, genre tint on the card trace"). A sibling of
 * `WaveCardContainer`/`WaveCard` (the feed row), not a variant of it — the
 * row's DOM is a hard dependency of `WaveCardContainer`'s click-capture
 * interception (matches transport/duet buttons by their translated text), so
 * reshaping it in place risked breaking that; this owns its own compact
 * audio wiring instead, the same `useSignedAudio` primitive
 * `BackingTracksLane.tsx`'s row already uses.
 *
 * Mounted only at `lg` (Explore picks one of this or the mobile row via
 * `useIsDesktopViewport`, never both) — this still saves/unsaves through the
 * same optimistic `useOptimistic` + `useActionToast` pair the row uses, so
 * the two surfaces feel identical even though they don't share markup.
 */
export function ExploreWaveCard({ wave, unheard = false }: ExploreWaveCardProps) {
  const t = useTranslations("WaveCard");
  const tTerms = useTranslations("Terms");
  const router = useRouter();
  const store = usePlaybackStore();
  const audio = useSignedAudio(wave.audioAssetId);
  const playback = useWavePlayback(wave.id, wave.duration ?? 0);
  const { notify } = useActionToast();
  const [, startTransition] = useTransition();
  const [shareOpen, setShareOpen] = useState(false);
  const [hasOpenedShare, setHasOpenedShare] = useState(false);

  const [optimisticSave, setOptimisticSave] = useOptimistic(
    { isSaved: wave.isSaved ?? false, saveCount: wave.metrics.saves },
    (_state, next: { isSaved: boolean; saveCount: number }) => next,
  );

  const creationType = CREATION_TYPES[wave.creationType];
  const creatorName = wave.creator.displayName ?? wave.creator.username;
  const hue = genreHueForTag(wave.tags?.[0] ?? null);
  const duration = playback.duration || wave.duration || 0;
  const progress = duration > 0 ? playback.currentTime / duration : 0;

  const handleToggle = useCallback(() => {
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
      store.play(wave.id, url, {
        title: wave.title,
        creatorUsername: wave.creator.username,
        duration: wave.duration,
        peaks: wave.peaks,
        assetId: wave.audioAssetId,
      });
    });
  }, [audio, playback.isActive, playback.isPlaying, store, wave]);

  const handleSave = useCallback(() => {
    const willSave = !optimisticSave.isSaved;
    startTransition(async () => {
      setOptimisticSave({
        isSaved: willSave,
        saveCount: optimisticSave.saveCount + (willSave ? 1 : -1),
      });
      const result = await (willSave ? saveWave(wave.id) : unsaveWave(wave.id));
      if (!result.ok) {
        notify(willSave ? "save" : "unsave", "error");
        return;
      }
      if (willSave) notify("save", "success");
      emitAnalyticsEvent({
        name: willSave ? "wave_saved" : "wave_unsaved",
        waveId: wave.id,
        sessionId: "n/a",
        at: Date.now(),
      });
    });
  }, [notify, optimisticSave.isSaved, optimisticSave.saveCount, setOptimisticSave, startTransition, wave.id]);

  const shownMetrics = METRICS.filter((metric) => (wave.metrics[metric.key] ?? 0) > 0);

  return (
    <article className="group flex flex-col gap-3 rounded-card border border-hairline bg-elevation-2 p-4 transition-[transform,box-shadow,border-color] duration-150 ease-[--ease-enter] hover:-translate-y-1 hover:border-hairline-strong hover:shadow-lift">
      <div className="flex items-center gap-2.5">
        <Link
          href={routes.profile(wave.creator.username)}
          className="relative shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
        >
          <Avatar name={creatorName} src={wave.creator.avatarUrl} size="sm" />
          {unheard ? <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-2 rounded-label bg-signal" /> : null}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={routes.profile(wave.creator.username)}
            className="type-body-sm truncate font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            {creatorName}
          </Link>
          <span className="type-caption truncate text-ink-subtle">@{wave.creator.username}</span>
        </div>
        <Badge>{tTerms(creationType.id)}</Badge>
      </div>

      <Link
        href={routes.wave(wave.id)}
        className="type-subhead line-clamp-2 text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
      >
        {wave.title}
      </Link>

      <div className="relative flex h-16 items-center rounded-key bg-elevation-1">
        <WaveformCanvas
          peaks={wave.peaks}
          progress={progress}
          loaded={playback.isActive ? playback.buffered : 1}
          state={playback.isActive && playback.isPlaying ? "playing" : "unplayed"}
          hue={hue}
          height={64}
        />
        <button
          type="button"
          aria-label={`${playback.isPlaying ? tTerms("pauseAction") : tTerms("playAction")} ${wave.title}`}
          onClick={handleToggle}
          className={cn(
            "akinti-press absolute inset-0 m-auto flex size-11 items-center justify-center rounded-full bg-tide text-on-ink transition-opacity duration-150",
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
            playback.isActive && playback.isPlaying && "opacity-100",
          )}
        >
          {playback.isActive && playback.isPlaying ? (
            <Pause className="size-5" weight="fill" />
          ) : (
            <Play className="size-5 translate-x-px" weight="fill" />
          )}
        </button>
      </div>

      {audio.error ? <p role="alert" className="type-caption text-signal-deep">{audio.error}</p> : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={tTerms("comment")}
            onClick={() => router.push(routes.waveComments(wave.id))}
            className="akinti-press flex size-9 items-center justify-center rounded-key text-ink-muted transition-colors hover:bg-elevation-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            <MessageSquare className="size-4" />
          </button>
          <button
            type="button"
            aria-label={optimisticSave.isSaved ? tTerms("unsave") : tTerms("save")}
            aria-pressed={optimisticSave.isSaved}
            onClick={handleSave}
            className={cn(
              "akinti-press flex size-9 items-center justify-center rounded-key transition-colors hover:bg-elevation-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide",
              optimisticSave.isSaved ? "text-tide" : "text-ink-muted hover:text-ink",
            )}
          >
            <Bookmark className="size-4" weight={optimisticSave.isSaved ? "fill" : "regular"} />
          </button>
          <button
            type="button"
            aria-label={tTerms("share")}
            onClick={() => {
              setHasOpenedShare(true);
              setShareOpen(true);
            }}
            className="akinti-press flex size-9 items-center justify-center rounded-key text-ink-muted transition-colors hover:bg-elevation-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            <Share2 className="size-4" />
          </button>
        </div>
        <time dateTime={String(wave.createdAt)} className="type-mono-sm shrink-0 text-ink-subtle">
          {timeAgo(wave.createdAt)}
        </time>
      </div>

      {shownMetrics.length > 0 ? (
        <p className="type-caption text-ink-subtle">
          {shownMetrics.slice(0, 2).map((metric, index) => {
            const value = metric.key === "saves" ? optimisticSave.saveCount : (wave.metrics[metric.key] ?? 0);
            return (
              <span key={metric.key}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                <span className="type-mono-sm text-ink-muted">{formatCount(value)}</span>{" "}
                {t(METRIC_LABEL_KEY[metric.key], { count: value })}
              </span>
            );
          })}
        </p>
      ) : null}

      {hasOpenedShare ? (
        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} wave={{ id: wave.id, title: wave.title }} />
      ) : null}
    </article>
  );
}
