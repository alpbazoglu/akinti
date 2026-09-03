/**
 * Pure reducer driving infinite scroll for Home and Explore lists.
 *
 * Kept framework-agnostic (no React import) so it is trivially unit-testable
 * and reusable from any client component that renders a paginated list of
 * `WaveCardContainer`s — `FollowingFeed` and `ExploreWaveList`
 * (`src/components/feed`) both wrap this in a `useReducer`.
 */

export type FeedStatus = "idle" | "loading" | "error";

export interface FeedState<T extends { id: string }> {
  items: T[];
  cursor: string | null;
  status: FeedStatus;
  error: string | null;
}

export type FeedAction<T extends { id: string }> =
  | { type: "loadMoreStart" }
  | { type: "loadMoreSuccess"; items: T[]; cursor: string | null }
  | { type: "loadMoreError"; error: string }
  /** Replace the whole list, e.g. switching Explore category tabs. */
  | { type: "reset"; items: T[]; cursor: string | null };

export function createInitialFeedState<T extends { id: string }>(
  items: T[],
  cursor: string | null,
): FeedState<T> {
  return { items, cursor, status: "idle", error: null };
}

export function feedReducer<T extends { id: string }>(
  state: FeedState<T>,
  action: FeedAction<T>,
): FeedState<T> {
  switch (action.type) {
    case "loadMoreStart":
      return { ...state, status: "loading", error: null };
    case "loadMoreSuccess": {
      const knownIds = new Set(state.items.map((item) => item.id));
      const deduped = action.items.filter((item) => !knownIds.has(item.id));
      return {
        items: [...state.items, ...deduped],
        cursor: action.cursor,
        status: "idle",
        error: null,
      };
    }
    case "loadMoreError":
      return { ...state, status: "error", error: action.error };
    case "reset":
      return { items: action.items, cursor: action.cursor, status: "idle", error: null };
    default:
      return state;
  }
}
