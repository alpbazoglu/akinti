"use client";

/**
 * Desktop card grid / mobile stream switcher for a fully-loaded (already
 * paginated by the caller) list of Waves — Challenge entries
 * (`[slug]/page.tsx`) and a hashtag page (`hashtag/[tag]/page.tsx`) both need
 * exactly this shape: "entries as a card grid" / "hashtag page grid"
 * (this pass's brief, items 1 and its "Not yet built" list), reusing the same
 * `ExploreWaveCard` Explore's own grid already draws from rather than a new
 * card component, so a Wave looks identical whether it was found through
 * Explore, a Challenge or a hashtag.
 *
 * One render path picked via `useIsDesktopViewport`, the same reasoning
 * `WaveFeedList` documents: each row/card mounts its own audio + analytics
 * hooks, so a hidden duplicate would double that cost for every item.
 * Unlike `WaveFeedList` this never fetches more itself — the caller's own
 * cursor pagination ("Older entries" / "Older Waves" link) still owns that,
 * unchanged.
 */

import { ExploreWaveCard } from "@/components/feed";
import { WaveCardContainer, type WaveCardContainerWave } from "@/components/wave";
import { useIsDesktopViewport } from "@/lib/ui";

export interface ChallengeWaveGridProps {
  waves: readonly WaveCardContainerWave[];
  unheardIds?: ReadonlySet<string>;
  className?: string;
}

export function ChallengeWaveGrid({ waves, unheardIds, className }: ChallengeWaveGridProps) {
  const isDesktop = useIsDesktopViewport();

  if (isDesktop) {
    return (
      <div className={className ?? "grid grid-cols-2 gap-4 xl:grid-cols-3"}>
        {waves.map((wave) => (
          <ExploreWaveCard
            key={wave.id}
            wave={wave}
            unheard={unheardIds?.has(wave.id) ?? false}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className ?? "flex flex-col divide-y divide-hairline border-t border-hairline"}>
      {waves.map((wave) => (
        <WaveCardContainer key={wave.id} wave={wave} unheard={unheardIds?.has(wave.id) ?? false} />
      ))}
    </div>
  );
}
