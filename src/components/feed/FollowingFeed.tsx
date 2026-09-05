"use client";

import { useCallback, useMemo, useReducer } from "react";

import { loadFollowingFeed } from "@/app/(app)/actions";
import type { WaveCardContainerWave } from "@/components/wave";
import { createInitialFeedState, feedReducer } from "@/lib/feed";

import { WaveFeedList } from "./WaveFeedList";

export interface FollowingFeedProps {
  initialItems: WaveCardContainerWave[];
  initialCursor: string | null;
  /** Wave ids the viewer has not heard yet, for the unheard mark (§4.1). */
  unheardIds?: readonly string[];
}

/**
 * Home's stream (SCREENS.md §2): Waves from the people this reader follows.
 *
 * Owns the paginated list state; `WaveFeedList` owns rendering and the scroll
 * trigger. Pages after the first arrive through `loadFollowingFeed`, and a
 * failure says what happened and offers one repair, rather than leaving a
 * skeleton on screen forever.
 */
export function FollowingFeed({ initialItems, initialCursor, unheardIds }: FollowingFeedProps) {
  const [state, dispatch] = useReducer(
    feedReducer<WaveCardContainerWave>,
    createInitialFeedState(initialItems, initialCursor),
  );

  const unheard = useMemo(() => new Set(unheardIds ?? []), [unheardIds]);

  const handleLoadMore = useCallback(() => {
    if (!state.cursor || state.status === "loading") {
      return;
    }
    const cursor = state.cursor;
    dispatch({ type: "loadMoreStart" });
    void loadFollowingFeed(cursor).then(
      (result) => {
        if (result.ok && result.data) {
          dispatch({
            type: "loadMoreSuccess",
            items: result.data.items,
            cursor: result.data.nextCursor,
          });
        } else {
          dispatch({ type: "loadMoreError", error: result.error ?? "Couldn't reach the stream." });
        }
      },
      // A rejected Server Action call (network drop, dev-server chunk error)
      // must still leave "loading", or the list is stuck showing a skeleton
      // forever with no way to retry.
      () => {
        dispatch({ type: "loadMoreError", error: "Couldn't reach the stream." });
      },
    );
  }, [state.cursor, state.status]);

  return (
    <WaveFeedList
      items={state.items}
      status={state.status}
      error={state.error}
      hasMore={state.cursor !== null}
      onLoadMore={handleLoadMore}
      unheardIds={unheard}
      endLabel="That's everything from the people you follow."
    />
  );
}
