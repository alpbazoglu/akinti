"use client";

/**
 * The persistent player (`docs/design/DESIGN.md` §8.4 "three sizes, one
 * drawing"; `docs/design/SCREENS.md` "The persistent player"). Shows
 * whenever a Wave is loaded in the single global playback store and the
 * reader has navigated away from that Wave's own detail page, where the full
 * player already covers this.
 *
 * A rail-hung strip, not a card: a hairline on top, no shadow, no radius, no
 * fill beyond the page ground. Driven entirely by `PlaybackStore`
 * (`src/lib/audio/playbackStore.ts`) via `useWaveControls`/`usePlaybackSelector`
 * — there is still exactly one `<audio>` element and one WaveSurfer instance
 * (`src/lib/audio/waveSurfer.ts`); this component only reads and commands
 * that store, it never creates a player of its own. Media Session metadata
 * and lock-screen handlers are already wired inside the store, so nothing
 * extra is needed here for that.
 *
 * Two mount points share one state: `MobilePlayerStrip` sits fixed above
 * `BottomNav`, safe-area aware. `DesktopPlayerStrip` is rendered inside
 * `AppShell`'s right column, where it sticks to the bottom of that column
 * rather than the full page width (SCREENS.md: "not a Spotify-style bottom
 * bar"). `useHasActivePersistentPlayer` lets `AppShell` decide whether that
 * column needs to exist at all on a page that passes no other contextual
 * `aside`.
 *
 * The one bit of motion here — the trace's playhead — is linear at zero
 * duration regardless of `prefers-reduced-motion` (§12.7: a playhead that
 * eases is lying about time); there is no other animation to reduce.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Waveform } from "@/components/audio";
import { IconButton, Spinner } from "@/components/ui";
import { Pause, Play, X } from "@/components/ui/icons";
import { usePlaybackSelector, usePlaybackStore, useWaveControls } from "@/lib/audio";
import { routes } from "@/config/routes";
import { cn } from "@/lib/ui";

interface ActivePlayback {
  readonly waveId: string;
  readonly title: string;
  readonly creatorUsername: string | null;
  readonly isPlaying: boolean;
  readonly isBusy: boolean;
  readonly progress: number;
  readonly peaks: readonly number[];
  readonly buffered: number;
  readonly toggle: () => void;
}

/**
 * A reference track playing behind an active recording (`RecordStage`'s
 * "sing over a track") is not a Wave the reader is listening to — the strip
 * never claims one of these, whatever page it is mounted on.
 */
function isBackingTrackId(waveId: string): boolean {
  return waveId.startsWith("backing-track:");
}

function useActivePlayback(): ActivePlayback | null {
  const pathname = usePathname();
  const waveId = usePlaybackSelector((state) => state.waveId);
  const src = usePlaybackSelector((state) => state.src);
  const status = usePlaybackSelector((state) => state.status);
  const title = usePlaybackSelector((state) => state.meta?.title);
  const creatorUsername = usePlaybackSelector((state) => state.meta?.creatorUsername);
  const duration = usePlaybackSelector((state) => state.duration);
  const currentTime = usePlaybackSelector((state) => state.currentTime);
  const decodedPeaks = usePlaybackSelector((state) => state.peaks);
  const storedPeaks = usePlaybackSelector((state) => state.meta?.peaks);
  const buffered = usePlaybackSelector((state) => state.buffered);

  // Hooks run unconditionally: the fallbacks below are inert until `eligible`
  // is true, which is also the only time their result is read.
  const { toggle } = useWaveControls(waveId ?? "", src ?? "", {
    title,
    creatorUsername,
    duration,
    peaks: decodedPeaks ?? storedPeaks,
  });

  const eligible =
    waveId !== null &&
    status !== "idle" &&
    !isBackingTrackId(waveId) &&
    pathname !== routes.wave(waveId);

  if (!eligible || waveId === null) return null;

  return {
    waveId,
    title: title ?? "Wave",
    creatorUsername: creatorUsername ?? null,
    isPlaying: status === "playing",
    isBusy: status === "loading" || status === "buffering",
    progress: duration > 0 ? Math.min(1, currentTime / duration) : 0,
    peaks: decodedPeaks ?? storedPeaks ?? [],
    buffered,
    toggle,
  };
}

/** Hook only: whether either strip has something to show. `AppShell` uses this to decide whether the right column needs to exist at all. */
export function useHasActivePersistentPlayer(): boolean {
  return useActivePlayback() !== null;
}

function PlayerBody({
  playback,
  onClose,
}: {
  playback: ActivePlayback;
  onClose: () => void;
}) {
  const label = playback.creatorUsername
    ? `${playback.title} · @${playback.creatorUsername}`
    : playback.title;
  const transportLabel = `${playback.isPlaying ? "Pause" : "Play"} ${playback.title}`;

  return (
    <div className="flex items-center gap-3 py-2">
      <IconButton
        label={transportLabel}
        icon={
          playback.isBusy ? (
            <Spinner size="md" label={null} />
          ) : playback.isPlaying ? (
            <Pause className="size-6" weight="fill" />
          ) : (
            <Play className="size-6 translate-x-px" weight="fill" />
          )
        }
        variant="primary"
        shape="round"
        size="lg"
        onClick={playback.toggle}
      />

      <Link href={routes.wave(playback.waveId)} className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-caption-strong truncate text-ink">{label}</span>
        <span aria-hidden="true">
          <Waveform peaks={playback.peaks} progress={playback.progress} loaded={playback.buffered} readOnly height={28} />
        </span>
      </Link>

      <IconButton label="Close player" icon={<X className="size-4" />} variant="ghost" size="sm" onClick={onClose} />
    </div>
  );
}

/** Mobile mini strip: fixed above `BottomNav`, clearing its safe-area padding too. */
export function MobilePlayerStrip({ className }: { className?: string }) {
  const playback = useActivePlayback();
  const store = usePlaybackStore();
  if (!playback) return null;

  return (
    <div
      className={cn(
        "akinti-page fixed inset-x-0 z-20 border-t border-hairline bg-paper lg:hidden",
        "bottom-[calc(var(--akinti-keyboard-h)+env(safe-area-inset-bottom,0px))]",
        className,
      )}
    >
      <PlayerBody playback={playback} onClose={() => store.stop()} />
    </div>
  );
}

/**
 * Desktop persistent player: mounted inside `AppShell`'s right column
 * (SCREENS.md "the persistent player, then context"), sticking to the
 * bottom of that column rather than the page.
 */
export function DesktopPlayerStrip({ className }: { className?: string }) {
  const playback = useActivePlayback();
  const store = usePlaybackStore();
  if (!playback) return null;

  return (
    <div className={cn("sticky bottom-0 border-t border-hairline bg-paper", className)}>
      <PlayerBody playback={playback} onClose={() => store.stop()} />
    </div>
  );
}
