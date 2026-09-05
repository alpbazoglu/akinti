/**
 * Signed playback URL freshness for the global playback store
 * (`playbackStore.ts`). `GET /api/audio/[assetId]/url` mints a URL good for
 * `SIGNED_AUDIO_URL_TTL_SECONDS` (10 minutes, `src/lib/supabase/config.ts`);
 * every caller that resolves one today (`WaveCardContainer`, `useTrackAudio`,
 * `AtismaTurnRecorder`, `signedAudio.ts`) caches it in component state for
 * the life of the component with no expiry check, so a Wave left paused, an
 * 8-turn atışma session, or a long stay on a screen outruns the TTL and the
 * `<audio>` element is then handed a dead URL: playback fails 403 with no
 * retry (review2 #8).
 *
 * This module is the one place that knows the endpoint's contract (constant
 * `404` on any authorization failure — never `403` — and `no-store`, per
 * `docs/SECURITY.md`'s audit of that route) and the one place that decides
 * "is the URL currently playing likely stale". `playbackStore.ts` uses both
 * to re-fetch a fresh URL itself, rather than surfacing a dead-URL error to
 * the reader for a Wave they are still authorized to hear.
 */

import { SIGNED_AUDIO_URL_TTL_SECONDS } from "@/lib/supabase/config";

/** Mirrors the endpoint's actual TTL, in milliseconds. */
export const SIGNED_AUDIO_URL_TTL_MS = SIGNED_AUDIO_URL_TTL_SECONDS * 1000;

/**
 * Refresh a URL slightly before it actually expires — a play that starts in
 * the last few seconds of the window should not race the server's clock.
 */
export const SIGNED_AUDIO_URL_REFRESH_MARGIN_MS = 15_000;

/**
 * True once `mintedAtMs` is old enough that the URL minted then should be
 * treated as stale and re-fetched before starting playback.
 */
export function isSignedAudioUrlStale(mintedAtMs: number, now: number = Date.now()): boolean {
  return now - mintedAtMs >= SIGNED_AUDIO_URL_TTL_MS - SIGNED_AUDIO_URL_REFRESH_MARGIN_MS;
}

export type FetchSignedAudioUrl = (assetId: string) => Promise<string | null>;

/**
 * Default fetcher: `GET /api/audio/[assetId]/url`, `no-store` (the same
 * request every existing resolver in `src/components/**` makes). Resolves to
 * `null` on any non-OK response (including the endpoint's constant `404`)
 * or network failure — never throws, so a caller can treat "could not
 * refresh" as just another reason to show the honest playback error.
 */
export const fetchSignedAudioUrl: FetchSignedAudioUrl = async (assetId) => {
  try {
    const response = await fetch(`/api/audio/${assetId}/url`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
};
