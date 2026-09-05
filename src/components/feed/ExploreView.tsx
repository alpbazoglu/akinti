"use client";

import { useCallback, useReducer, useState } from "react";
import Link from "next/link";

import { loadExploreCategory } from "@/app/(app)/explore/actions";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { Button, EmptyState, Tabs, tabPanelId, tabId } from "@/components/ui";
import type { WaveCardContainerWave } from "@/components/wave";
import { EXPLORE_CATEGORIES, EXPLORE_CATEGORY_META, createInitialFeedState, feedReducer, type ExploreCategory } from "@/lib/feed";

import { WaveFeedList } from "./WaveFeedList";

export interface ExploreViewProps {
  initialCategory: ExploreCategory;
  initialItems: WaveCardContainerWave[];
  initialCursor: string | null;
}

const TAB_ITEMS = EXPLORE_CATEGORIES.map((key) => ({
  value: key,
  label: EXPLORE_CATEGORY_META[key].label,
}));

/**
 * Explore's category tabs + Wave list (spec s10). One `feedReducer` instance
 * per mounted category tab (`useReducer` keyed by category via a `Map`),
 * loaded lazily the first time a tab is opened — so switching tabs never
 * re-fetches a category the viewer already loaded, and nothing beyond the
 * active tab's first page fetches eagerly (spec s35).
 */
export function ExploreView({ initialCategory, initialItems, initialCursor }: ExploreViewProps) {
  const [active, setActive] = useState<ExploreCategory>(initialCategory);
  const [statesByCategory, dispatch] = useReducer(
    categoriesReducer,
    initialCategoryStates(initialCategory, initialItems, initialCursor),
  );

  const state = statesByCategory.get(active) ?? createInitialFeedState<WaveCardContainerWave>([], null);

  const loadCategory = useCallback((category: ExploreCategory, cursor: string | null) => {
    dispatch({ type: "start", category });
    void loadExploreCategory(category, cursor).then(
      (result) => {
        if (result.ok && result.data) {
          dispatch({
            type: "success",
            category,
            items: result.data.items,
            cursor: result.data.nextCursor,
          });
        } else {
          dispatch({ type: "error", category, error: result.error ?? "Could not load this category." });
        }
      },
      // The Server Action call itself can reject — a network drop, a dev-server
      // chunk error, anything short of the `{ ok, error }` contract
      // `loadExploreCategory` returns for its own handled failures. Without
      // this, a tab that hits one of those never leaves "loading": nothing
      // else transitions its status away from the skeleton it started in.
      () => {
        dispatch({ type: "error", category, error: "Could not load this category. Check your connection and try again." });
      },
    );
  }, []);

  const handleTabChange = useCallback(
    (value: string) => {
      const category = value as ExploreCategory;
      setActive(category);
      const existing = statesByCategory.get(category);
      if (!existing) {
        loadCategory(category, null);
      }
    },
    [loadCategory, setActive, statesByCategory],
  );

  const handleLoadMore = useCallback(() => {
    if (!state.cursor || state.status === "loading") {
      return;
    }
    loadCategory(active, state.cursor);
  }, [active, loadCategory, state.cursor, state.status]);

  const baseId = "explore-categories";

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        items={TAB_ITEMS}
        value={active}
        onValueChange={handleTabChange}
        label="Explore categories"
        idPrefix={baseId}
        className="px-4 sm:px-5"
      />
      <div
        role="tabpanel"
        id={tabPanelId(baseId, active)}
        aria-labelledby={tabId(baseId, active)}
        className="focus-visible:outline-2 focus-visible:outline-ring"
      >
        {state.status === "loading" && state.items.length === 0 ? (
          <WaveFeedList
            items={[]}
            status="loading"
            error={null}
            hasMore={false}
            onLoadMore={() => {}}
            className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-5"
          />
        ) : state.items.length === 0 && state.status !== "loading" ? (
          <EmptyState
            title={
              state.status === "error"
                ? "Could not load this category"
                : `No ${EXPLORE_CATEGORY_META[active].label.toLowerCase()} Waves yet`
            }
            description={
              state.status === "error"
                ? (state.error ?? "Try again.")
                : EXPLORE_CATEGORY_META[active].description
            }
            action={
              state.status === "error" ? (
                <Button variant="secondary" size="sm" onClick={() => loadCategory(active, null)}>
                  Try again
                </Button>
              ) : (
                <Link
                  href={routes.create()}
                  className="text-sm font-medium text-accent underline underline-offset-2"
                >
                  Be the first — record a {TERMS.wave}
                </Link>
              )
            }
          />
        ) : (
          <WaveFeedList
            items={state.items}
            status={state.status}
            error={state.error}
            hasMore={state.cursor !== null}
            onLoadMore={handleLoadMore}
            className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-5"
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local state: one FeedState per category, keyed by category                 */
/* -------------------------------------------------------------------------- */

type CategoryStates = Map<ExploreCategory, ReturnType<typeof createInitialFeedState<WaveCardContainerWave>>>;

type CategoriesAction =
  | { type: "start"; category: ExploreCategory }
  | { type: "success"; category: ExploreCategory; items: WaveCardContainerWave[]; cursor: string | null }
  | { type: "error"; category: ExploreCategory; error: string };

function initialCategoryStates(
  category: ExploreCategory,
  items: WaveCardContainerWave[],
  cursor: string | null,
): CategoryStates {
  const map: CategoryStates = new Map();
  map.set(category, createInitialFeedState(items, cursor));
  return map;
}

function categoriesReducer(state: CategoryStates, action: CategoriesAction): CategoryStates {
  const current = state.get(action.category) ?? createInitialFeedState<WaveCardContainerWave>([], null);
  const next = new Map(state);
  switch (action.type) {
    case "start":
      next.set(action.category, feedReducer(current, { type: "loadMoreStart" }));
      return next;
    case "success":
      next.set(
        action.category,
        feedReducer(current, { type: "loadMoreSuccess", items: action.items, cursor: action.cursor }),
      );
      return next;
    case "error":
      next.set(action.category, feedReducer(current, { type: "loadMoreError", error: action.error }));
      return next;
    default:
      return state;
  }
}

