"use client";

/**
 * The backing-track play widget for `/challenges/[slug]` (spec item 4:
 * "backing track play"). A signed playback URL is resolved lazily on first
 * press, the same pattern `WaveCardContainer` uses for a Wave's own audio —
 * a backing track is not a Wave, so it goes through the same global
 * `usePlaybackStore` directly rather than through `WaveCard`.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";

import { IconButton } from "@/components/ui";
import { Pause, Play } from "@/components/ui/icons";
import { usePlaybackStore, useWavePlayback } from "@/lib/audio";
import { cn, formatDuration } from "@/lib/ui";

export interface ChallengeBackingTrackProps {
  assetId: string;
  title: string;
  artistCredit: string;
  durationMs: number | null;
  className?: string;
}

export function ChallengeBackingTrack({
  assetId,
  title,
  artistCredit,
  durationMs,
  className,
}: ChallengeBackingTrackProps) {
  const store = usePlaybackStore();
  const t = useTranslations("ChallengeBackingTrack");
  const trackKey = `backing-track:${assetId}`;
  const playback = useWavePlayback(trackKey, durationMs ? durationMs / 1000 : 0);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (playback.isActive) {
      store.toggle(trackKey, url ?? "", { title, creatorUsername: artistCredit, duration: playback.duration });
      return;
    }
    if (url) {
      store.play(trackKey, url, { title, creatorUsername: artistCredit, duration: playback.duration });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/audio/${assetId}/url`, { cache: "no-store" });
      if (!response.ok) throw new Error(`playback url request failed (${response.status})`);
      const data = (await response.json()) as { url?: string };
      if (!data.url) throw new Error("playback url response missing url");
      setUrl(data.url);
      store.play(trackKey, data.url, { title, creatorUsername: artistCredit, duration: playback.duration });
    } catch {
      setError(t("couldNotLoad"));
    } finally {
      setLoading(false);
    }
  };

  const isPlaying = playback.isActive && playback.isPlaying;

  return (
    <div className={cn("flex items-center gap-3 border-t border-hairline py-3", className)}>
      {/* Secondary (hairline) shape with a sand-tinted glyph: the
          backing-track mark is sand, distinct from a Wave's own transport,
          which is the current (`docs/design/COLOR_V2.md` "Challenges"). */}
      <IconButton
        label={isPlaying ? t("pauseTrack", { title }) : t("playTrack", { title })}
        icon={
          <span className="text-sand">
            {isPlaying ? (
              <Pause className="size-5" weight="fill" />
            ) : (
              <Play className="size-5 translate-x-px" weight="fill" />
            )}
          </span>
        }
        variant="secondary"
        shape="round"
        size="md"
        onClick={() => void handleToggle()}
        disabled={loading}
      />
      <div className="flex min-w-0 flex-col">
        <span className="type-subhead truncate text-ink">{title}</span>
        <span className="type-caption truncate text-ink-subtle">
          {artistCredit}
          {durationMs ? (
            <>
              <span aria-hidden="true"> &middot; </span>
              {formatDuration(durationMs / 1000)}
            </>
          ) : null}
        </span>
        {error ? <span className="type-caption text-signal-deep">{error}</span> : null}
      </div>
    </div>
  );
}
