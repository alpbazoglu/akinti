"use client";

/**
 * Presentational infinite-scroll list of `WaveCardContainer`s, shared by
 * `FollowingFeed` (Home, spec s9) and `ExploreCategoryPanel` (Explore, spec
 * s10). This component owns rendering and the "when should we fetch more"
 * decision (`IntersectionObserver`, with an explicit "Load more" button as a
 * fallback — spec s9); the caller owns the actual fetch and reducer
 * (`src/lib/feed/feedReducer.ts`), so the same list works whether the source
 * is a cursor-paginated home feed or an Explore category tab.
 */

import { useEffect, useRef } from "react";

import { WaveCardContainer, WaveCardSkeleton, type WaveCardContainerWave } from "@/components/wave";
import { Button } from "@/components/ui";
import type { FeedStatus } from "@/lib/feed";

export interface WaveFeedListProps {
  items: readonly WaveCardContainerWave[];
  status: FeedStatus;
  error: string | null;
  /** `null` cursor means the list is exhausted. */
  hasMore: boolean;
  onLoadMore: () => void;
  className?: string;
}

export function WaveFeedList({ items, status, error, hasMore, onLoadMore, className }: WaveFeedListProps) {
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
    <div className={className}>
      <div className="flex flex-col gap-3 sm:gap-4">
        {items.map((wave) => (
          <WaveCardContainer key={wave.id} wave={wave} />
        ))}
      </div>

      {status === "loading" ? (
        <div className="flex flex-col gap-3 pt-3 sm:gap-4">
          <WaveCardSkeleton />
        </div>
      ) : null}

      {/* Off-screen trigger for IntersectionObserver; the button below is the
          always-visible, no-JS-observer-required fallback (spec s9). */}
      {hasMore ? <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" /> : null}

      <div className="flex flex-col items-center gap-2 py-4">
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
        {hasMore ? (
          <Button variant="secondary" size="sm" onClick={onLoadMore} loading={status === "loading"}>
            {error ? "Try again" : "Load more"}
          </Button>
        ) : items.length > 0 ? (
          <p className="text-xs text-fg-subtle">You&apos;ve reached the end.</p>
        ) : null}
      </div>
    </div>
  );
}
