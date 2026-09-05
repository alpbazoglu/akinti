"use client";

/**
 * The stream (§8.3, §8.15, SCREENS.md §2).
 *
 * Presentational infinite-scroll list of `WaveCardContainer`s, shared by
 * `FollowingFeed` (Home) and `ExploreView` (Explore). This component owns
 * rendering and the "when should we fetch more" decision
 * (`IntersectionObserver`, with an explicit key as the always-reachable
 * fallback); the caller owns the fetch and the reducer
 * (`src/lib/feed/feedReducer.ts`), so the same list works whether the source
 * is a cursor-paginated home feed or an Explore lane.
 *
 * Items are not gapped: each Wave carries its own 20/24px padding and ends in
 * a waterline drawn from its own peaks, so the rhythm comes from the item,
 * not from a flex gap between boxes (§5.1).
 */

import { useEffect, useRef } from "react";

import { WaveCardContainer, WaveCardSkeleton, type WaveCardContainerWave } from "@/components/wave";
import type { FeedStatus } from "@/lib/feed";
import { cn } from "@/lib/ui";

export interface WaveFeedListProps {
  items: readonly WaveCardContainerWave[];
  status: FeedStatus;
  error: string | null;
  /** `null` cursor means the list is exhausted. */
  hasMore: boolean;
  onLoadMore: () => void;
  /** Waves this viewer has not heard yet: they carry the unheard mark (§4.1). */
  unheardIds?: ReadonlySet<string>;
  /** Shown once the list is exhausted. Omit to end the stream silently. */
  endLabel?: string | null;
  className?: string;
}

export function WaveFeedList({
  items,
  status,
  error,
  hasMore,
  onLoadMore,
  unheardIds,
  endLabel = null,
  className,
}: WaveFeedListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  // Keep the ref current without writing to it during render (the "latest
  // ref" pattern) — the IntersectionObserver effect below reads it lazily so
  // it never has to re-subscribe just because a new `onLoadMore` identity
  // was passed down.
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    if (!hasMore || status === "loading") {
      return;
    }
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, status]);

  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((wave) => (
        <WaveCardContainer
          key={wave.id}
          wave={wave}
          unheard={unheardIds?.has(wave.id) ?? false}
        />
      ))}

      {status === "loading" ? <WaveCardSkeleton /> : null}

      {/* Off-screen trigger for IntersectionObserver; the key below is the
          always-visible, no-observer-required fallback. */}
      {hasMore ? <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" /> : null}

      {error ? (
        <div className="akinti-page flex flex-col items-start gap-3 py-6">
          <p role="alert" className="type-body-sm measure text-signal-deep">
            {error}
          </p>
          <button
            type="button"
            onClick={onLoadMore}
            className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            Try again
          </button>
        </div>
      ) : hasMore && status !== "loading" ? (
        <div className="akinti-page py-6">
          <button
            type="button"
            onClick={onLoadMore}
            className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
          >
            Load more
          </button>
        </div>
      ) : !hasMore && items.length > 0 && endLabel ? (
        <p className="akinti-page type-caption py-6 text-ink-subtle">{endLabel}</p>
      ) : null}
    </div>
  );
}
