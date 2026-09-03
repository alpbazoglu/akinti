"use client";

/**
 * Data-fetching wrapper around the presentation-only `WaveCard` (spec §33,
 * §12, §14). `WaveCard`/`WavePlayer` are never modified — this container
 * resolves a short-lived signed playback URL lazily, on first play rather
 * than on mount, via `GET /api/audio/[assetId]/url`, then feeds it straight
 * to the global playback store. It also wires the four social actions (spec
 * §14, §15): Comment, Save, Share and Request a Duet.
 *
 * How the playback interception works without touching `WavePlayer`: while
 * no URL has been resolved yet, this component listens for clicks in the
 * CAPTURE phase (fires before `WavePlayer`'s own `onClick`, since capture
 * always runs outer-to-inner). If the click landed on the transport button —
 * matched by its accessible name, which `WavePlayer` always sets to "Play …"
 * / "Pause …" / "Retry playback" — the click is stopped before `WavePlayer`
 * ever sees it (so the store never gets asked to play an empty `src`), the
 * signed URL is fetched, and playback is started directly through the store
 * once it resolves. Any other click (profile link, Comment/Save/Share, the
 * waveform seek bar) passes through untouched; seeking an inactive Wave is
 * already a no-op in `useWaveControls`.
 *
 * The Request-a-Duet tooltip is wired the same DOM-query way, for the same
 * reason: `WaveCard`'s duet button (`TERMS.requestDuet`) already supports
 * `disabled` via `wave.canRequestDuet`, but exposes no prop for *why* it's
 * disabled, and `WaveCard.tsx` is owned by the Waves stage, not this one — so
 * rather than fork the presentational component, the reason is attached as a
 * native `title` attribute on the existing button after render, matched by
 * its accessible name exactly like the transport-button interception above.
 */

import { useCallback, useEffect, useReducer, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import { saveWave, unsaveWave } from "@/app/(app)/w/[id]/interactions";
import { usePlaybackStore } from "@/lib/audio";
import { saveReducer } from "@/lib/interactions";
import { emitAnalyticsEvent, usePlayTracker } from "@/lib/metrics";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { ShareSheet } from "@/components/share";
import { useToast } from "@/components/ui";

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

const DUET_DISABLED_TITLE = "This creator isn't accepting Duet Requests right now.";

export function WaveCardContainer({ wave, onComment, onSave, onShare, onRequestDuet, ...rest }: WaveCardContainerProps) {
  const store = usePlaybackStore();
  const router = useRouter();
  const { toast } = useToast();
  usePlayTracker();

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchingRef = useRef<Promise<string | null> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [saveState, dispatchSave] = useReducer(saveReducer, {
    isSaved: wave.isSaved ?? false,
    saveCount: wave.metrics.saves,
    status: "idle" as const,
  });
  const [shareOpen, setShareOpen] = useState(false);

  const canRequestDuet = wave.canRequestDuet ?? true;

  // Attach a title/tooltip to the (already-disabled) Request-a-Duet button
  // without editing WaveCard.tsx — see the file-level doc comment.
  useEffect(() => {
    const button = Array.from(
      cardRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((el) => el.textContent?.trim().startsWith(TERMS.requestDuet));
    if (!button) return;
    if (canRequestDuet) {
      button.removeAttribute("title");
    } else {
      button.title = DUET_DISABLED_TITLE;
    }
  }, [canRequestDuet]);

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

  /** Comment opens the comments Sheet on cards that render one; the default here navigates to the Wave's comments section (spec §14 — either is acceptable). */
  const handleComment = useCallback(
    (waveId: string) => {
      onComment?.(waveId);
      router.push(routes.waveComments(waveId));
    },
    [onComment, router],
  );

  /** Save/Unsave with optimistic UI and rollback on failure (spec §14). */
  const handleSave = useCallback(
    (waveId: string) => {
      onSave?.(waveId);
      const willSave = !saveState.isSaved;
      dispatchSave({ type: "toggle" });

      const action = willSave ? saveWave(waveId) : unsaveWave(waveId);
      void action.then((result) => {
        if (!result.ok) {
          dispatchSave({ type: "rollback" });
          toast({ title: result.error ?? "Could not update this Save. Try again.", tone: "error" });
          return;
        }
        dispatchSave({ type: "confirm" });
        emitAnalyticsEvent({
          name: willSave ? "wave_saved" : "wave_unsaved",
          waveId,
          sessionId: "n/a",
          at: Date.now(),
        });
      });
    },
    [onSave, saveState.isSaved, toast],
  );

  const handleShare = useCallback(
    (waveId: string) => {
      onShare?.(waveId);
      setShareOpen(true);
    },
    [onShare],
  );

  const handleRequestDuet = useCallback(
    (waveId: string) => {
      onRequestDuet?.(waveId);
      if (!canRequestDuet) return;
      router.push(routes.waveDuet(waveId));
    },
    [onRequestDuet, canRequestDuet, router],
  );

  return (
    <div ref={cardRef} onClickCapture={handleClickCapture}>
      <WaveCard
        wave={{
          ...wave,
          audioUrl: audioUrl ?? "",
          isSaved: saveState.isSaved,
          metrics: { ...wave.metrics, saves: saveState.saveCount },
        }}
        onComment={handleComment}
        onSave={handleSave}
        onShare={handleShare}
        onRequestDuet={handleRequestDuet}
        {...rest}
      />
      {loadError ? (
        <p role="alert" className="px-4 pb-2 text-xs text-danger sm:px-5">
          {loadError}
        </p>
      ) : null}

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} wave={{ id: wave.id, title: wave.title }} />
    </div>
  );
}
