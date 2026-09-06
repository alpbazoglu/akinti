"use client";

/**
 * Challenge entries (`[slug]/page.tsx`). Unlike a hashtag page or Explore,
 * this route's mobile entries list has always been plain title-only rows —
 * this pass's brief keeps mobile pixel-identical, so that shape stays
 * exactly as it was rather than being upgraded to a full `WaveCardContainer`
 * row (which is what `ChallengeWaveGrid` renders on mobile, correctly, for
 * the hashtag page it was built for — a different route with a different
 * existing mobile shape). Desktop gets the real payoff: "entries as a card
 * grid with hover play" (item 1), via the same `ExploreWaveCard` Explore's
 * own grid uses.
 *
 * One `useIsDesktopViewport()` call picks a single render path, the same
 * reasoning `WaveFeedList`/`ChallengeWaveGrid` document — a grid of cards
 * carries real audio + analytics hooks per item, not worth mounting twice
 * behind a CSS `hidden` class just to keep one path "just in case."
 */

import Link from "next/link";

import { ExploreWaveCard } from "@/components/feed";
import type { WaveCardContainerWave } from "@/components/wave";
import { routes } from "@/config/routes";
import { useIsDesktopViewport } from "@/lib/ui";

export interface ChallengeEntriesGridProps {
  entries: readonly WaveCardContainerWave[];
}

export function ChallengeEntriesGrid({ entries }: ChallengeEntriesGridProps) {
  const isDesktop = useIsDesktopViewport();

  if (isDesktop) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {entries.map((entry) => (
          <ExploreWaveCard key={entry.id} wave={entry} />
        ))}
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link href={routes.wave(entry.id)} className="block py-3 type-body text-ink hover:bg-paper-raised">
            {entry.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}
