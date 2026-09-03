"use client";

import { useCallback, useReducer } from "react";

import { loadFollowingFeed } from "@/app/(app)/actions";
import type { WaveCardContainerWave } from "@/components/wave";
import { createInitialFeedState, feedReducer } from "@/lib/feed";

import { WaveFeedList } from "./WaveFeedList";

export interface FollowingFeedProps {
  initialItems: WaveCardContainerWave[];
  initialCursor: string | null;
}

/** Client half of `/` (spec s9): owns the paginated list state, `WaveFeedList` owns rendering + the scroll trigger. */
export function FollowingFeed({ initialItems, initialCursor }: FollowingFeedProps) {
  const [state, dispatch] = useReducer(
    feedReducer<WaveCardContainerWave>,
    createInitialFeedState(initialItems, initialCursor),
  );

  const handleLoadMore = useCallback(() => {
    if (!state.cursor || state.status === "loading") {
      return;
    }
    const cursor = state.cursor;
    dispatch({ type: "loadMoreStart" });
    void loadFollowingFeed(cursor).then((result) => {
      if (result.ok && result.data) {
        dispatch({ type: "loadMoreSuccess", items: result.data.items, cursor: result.data.nextCursor });
      } else {
        dispatch({ type: "loadMoreError", error: result.error ?? "Could not load more Waves. Try again." });
      }
    });
  }, [state.cursor, state.status]);

  return (
    <WaveFeedList
      items={state.items}
      status={state.status}
      error={state.error}
      hasMore={state.cursor !== null}
      onLoadMore={handleLoadMore}
      className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-5"
    />
  );
}
