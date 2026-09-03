import { describe, expect, it } from "vitest";

import { createInitialFeedState, feedReducer, type FeedState } from "./feedReducer";

interface Item {
  id: string;
}

function items(...ids: string[]): Item[] {
  return ids.map((id) => ({ id }));
}

describe("createInitialFeedState", () => {
  it("starts idle with no error", () => {
    const state = createInitialFeedState(items("a", "b"), "cursor-1");
    expect(state).toEqual({ items: items("a", "b"), cursor: "cursor-1", status: "idle", error: null });
  });
});

describe("feedReducer", () => {
  it("loadMoreStart sets loading and clears any prior error", () => {
    const state: FeedState<Item> = { items: items("a"), cursor: "c1", status: "error", error: "boom" };
    const next = feedReducer(state, { type: "loadMoreStart" });
    expect(next.status).toBe("loading");
    expect(next.error).toBeNull();
    expect(next.items).toEqual(items("a"));
  });

  it("loadMoreSuccess appends items and advances the cursor", () => {
    const state = createInitialFeedState(items("a", "b"), "c1");
    const next = feedReducer(state, { type: "loadMoreSuccess", items: items("c", "d"), cursor: "c2" });
    expect(next.items).toEqual(items("a", "b", "c", "d"));
    expect(next.cursor).toBe("c2");
    expect(next.status).toBe("idle");
  });

  it("loadMoreSuccess with a null cursor signals exhaustion", () => {
    const state = createInitialFeedState(items("a"), "c1");
    const next = feedReducer(state, { type: "loadMoreSuccess", items: items("b"), cursor: null });
    expect(next.cursor).toBeNull();
  });

  it("loadMoreSuccess de-duplicates items already present by id", () => {
    const state = createInitialFeedState(items("a", "b"), "c1");
    const next = feedReducer(state, {
      type: "loadMoreSuccess",
      items: items("b", "c"),
      cursor: "c2",
    });
    expect(next.items).toEqual(items("a", "b", "c"));
  });

  it("loadMoreError sets the error and status without touching items or cursor", () => {
    const state = createInitialFeedState(items("a"), "c1");
    const next = feedReducer(state, { type: "loadMoreError", error: "Network error" });
    expect(next.status).toBe("error");
    expect(next.error).toBe("Network error");
    expect(next.items).toEqual(items("a"));
    expect(next.cursor).toBe("c1");
  });

  it("reset replaces the entire list and cursor, e.g. switching Explore tabs", () => {
    const state = createInitialFeedState(items("a", "b"), "c1");
    const next = feedReducer(state, { type: "reset", items: items("x"), cursor: "cx" });
    expect(next.items).toEqual(items("x"));
    expect(next.cursor).toBe("cx");
    expect(next.status).toBe("idle");
    expect(next.error).toBeNull();
  });

  it("a retry after an error can still succeed and clears the error", () => {
    let state = createInitialFeedState(items("a"), "c1");
    state = feedReducer(state, { type: "loadMoreError", error: "boom" });
    state = feedReducer(state, { type: "loadMoreStart" });
    state = feedReducer(state, { type: "loadMoreSuccess", items: items("b"), cursor: null });
    expect(state).toEqual({ items: items("a", "b"), cursor: null, status: "idle", error: null });
  });
});
