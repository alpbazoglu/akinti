"use client";

/**
 * `/tracks` picks one render path via `useIsDesktopViewport` — mobile keeps
 * `BackingTracksLane`'s existing teaser-lane shape exactly as it was, desktop
 * swaps in the filterable card grid (this pass's brief, item 2). Both mount
 * one audio hook per track, so — as with every other desktop grid in this
 * pass — this avoids a CSS-hidden duplicate of the other.
 */

import { BackingTracksLane, type BackingTrackCard } from "@/components/feed";
import { useIsDesktopViewport } from "@/lib/ui";

import { TracksLibraryGrid } from "./TracksLibraryGrid";

export interface TracksViewProps {
  tracks: readonly BackingTrackCard[];
}

export function TracksView({ tracks }: TracksViewProps) {
  const isDesktop = useIsDesktopViewport();
  return isDesktop ? <TracksLibraryGrid tracks={tracks} /> : <BackingTracksLane tracks={tracks} />;
}
