"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Resolve a short-lived signed playback URL, lazily, on first play.
 *
 * Audio bytes are never fetched on mount: a stream of ten Waves would
 * otherwise open ten range requests before the reader has touched anything.
 * The URL is requested the first time someone actually asks for sound, then
 * held for the life of the component.
 *
 * Shared by `WaveCardContainer` and the bare traces on Home's empty state so
 * both resolve audio the same way.
 */
export interface SignedAudio {
  url: string | null;
  error: string | null;
  /** Resolves to the signed URL, or `null` when the request failed. */
  resolve: () => Promise<string | null>;
}

export function useSignedAudio(audioAssetId: string): SignedAudio {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<string | null> | null>(null);

  const resolve = useCallback((): Promise<string | null> => {
    if (url) return Promise.resolve(url);
    if (inFlight.current) return inFlight.current;

    const request = fetch(`/api/audio/${audioAssetId}/url`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`playback url request failed (${response.status})`);
        }
        const data = (await response.json()) as { url?: string };
        if (!data.url) {
          throw new Error("playback url response missing url");
        }
        setError(null);
        setUrl(data.url);
        return data.url;
      })
      .catch(() => {
        setError("This Wave's audio didn't load.");
        return null;
      })
      .finally(() => {
        inFlight.current = null;
      });

    inFlight.current = request;
    return request;
  }, [audioAssetId, url]);

  return { url, error, resolve };
}
