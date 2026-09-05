"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Resolve a signed playback URL for a backing track.
 *
 * `GET /api/audio/[assetId]/url` is the only way a browser ever learns a
 * playable audio URL in this product (spec §33), and a backing track is an
 * ordinary private audio asset like any other.
 *
 * Unlike a feed card, which resolves lazily on first play, the record screen
 * needs the track ready *before* the count-in: a singer pressing record and
 * then waiting for a fetch has already lost the take. So this resolves on
 * mount and offers a real retry, because "the track didn't load" must never
 * be a dead end (spec §38).
 */
export interface TrackAudio {
  readonly url: string | null;
  readonly error: string | null;
  readonly retry: () => void;
}

interface Resolved {
  readonly assetId: string;
  readonly url: string | null;
  readonly error: string | null;
}

export function useTrackAudio(audioAssetId: string | null): TrackAudio {
  // Keyed by the asset id it resolved, not reset in a separate branch: when
  // `audioAssetId` changes (including to `null`), a stale result simply no
  // longer matches and the derived `url`/`error` below fall back to `null`
  // on their own, with no synchronous `setState` in the effect body.
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!audioAssetId) return;

    let cancelled = false;
    fetch(`/api/audio/${audioAssetId}/url`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`playback url request failed (${response.status})`);
        const data = (await response.json()) as { url?: string };
        if (!data.url) throw new Error("playback url response missing url");
        if (!cancelled) setResolved({ assetId: audioAssetId, url: data.url, error: null });
      })
      .catch(() => {
        if (!cancelled) {
          setResolved({ assetId: audioAssetId, url: null, error: "We couldn't load this track." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [audioAssetId, attempt]);

  const current = resolved && resolved.assetId === audioAssetId ? resolved : null;

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { url: current?.url ?? null, error: current?.error ?? null, retry };
}
