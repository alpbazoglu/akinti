"use client";

/**
 * Data-fetching wrapper around the presentation-only `WaveCard` (spec §33,
 * §12). `WaveCard`/`WavePlayer` are never modified — this container resolves
 * a short-lived signed playback URL lazily, on first play rather than on
 * mount, via `GET /api/audio/[assetId]/url`, then feeds it straight to the
 * global playback store.
 *
 * How the interception works without touching `WavePlayer`: while no URL has
 * been resolved yet, this component listens for clicks in the CAPTURE phase
 * (fires before `WavePlayer`'s own `onClick`, since capture always runs
 * outer-to-inner). If the click landed on the transport button — matched by
 * its accessible name, which `WavePlayer` always sets to "Play …" / "Pause
 * …" / "Retry playback" — the click is stopped before `WavePlayer` ever sees
 * it (so the store never gets asked to play an empty `src`), the signed URL
 * is fetched, and playback is started directly through the store once it
 * resolves. Any other click (profile link, Comment/Save/Share, the waveform
 * seek bar) passes through untouched; seeking an inactive Wave is already a
 * no-op in `useWaveControls`.
 */

import { useCallback, useRef, useState, type MouseEvent } from "react";

import { usePlaybackStore } from "@/lib/audio";
import { usePlayTracker } from "@/lib/metrics";

import { WaveCard, type WaveCardProps, type WaveCardWave } from "./WaveCard";

export type WaveCardContainerWave = Omit<WaveCardWave, "audioUrl"> & {
  /** `audio_assets.id` — resolved to a signed URL lazily on first play. */
  readonly audioAssetId: string;
};

export interface WaveCardContainerProps extends Omit<WaveCardProps, "wave"> {
  wave: WaveCardContainerWave;
}

/** Matches `WavePlayer`'s `accessibleName` for the transport button exactly. */
const TRANSPORT_LABEL_RE = /^(Play|Pause|Retry playback)\b/;

export function WaveCardContainer({ wave, ...rest }: WaveCardContainerProps) {
  const store = usePlaybackStore();
  usePlayTracker();

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchingRef = useRef<Promise<string | null> | null>(null);

  const ensureAudioUrl = useCallback((): Promise<string | null> => {
    if (audioUrl) {
      return Promise.resolve(audioUrl);
    }
    if (fetchingRef.current) {
      return fetchingRef.current;
    }

    const request = fetch(`/api/audio/${wave.audioAssetId}/url`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`playback url request failed (${response.status})`);
        }
        const data = (await response.json()) as { url?: string };
        if (!data.url) {
          throw new Error("playback url response missing url");
        }
        setLoadError(null);
        setAudioUrl(data.url);
        return data.url;
      })
      .catch(() => {
        setLoadError("This Wave's audio could not be loaded. Try again.");
        return null;
      })
      .finally(() => {
        fetchingRef.current = null;
      });

    fetchingRef.current = request;
    return request;
  }, [audioUrl, wave.audioAssetId]);

  const handleClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (audioUrl) {
        // Already resolved: let WaveCard/WavePlayer handle the click normally.
        return;
      }
      const target = event.target as HTMLElement;
      const control = target.closest("button[aria-label]");
      const label = control?.getAttribute("aria-label") ?? "";
      if (!TRANSPORT_LABEL_RE.test(label)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      void ensureAudioUrl().then((url) => {
        if (!url) return;
        store.play(wave.id, url, {
          title: wave.title,
          creatorUsername: wave.creator.username,
          duration: wave.duration,
        });
      });
    },
    [audioUrl, ensureAudioUrl, store, wave.id, wave.title, wave.creator.username, wave.duration],
  );

  return (
    <div onClickCapture={handleClickCapture}>
      <WaveCard wave={{ ...wave, audioUrl: audioUrl ?? "" }} {...rest} />
      {loadError ? (
        <p role="alert" className="px-4 pb-2 text-xs text-danger sm:px-5">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
