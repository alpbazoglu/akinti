import { describe, expect, it } from "vitest";

import { unreadMessagesReducer } from "./unreadReducer";

describe("unreadMessagesReducer", () => {
  it("sets the count outright", () => {
    expect(unreadMessagesReducer(0, { type: "set", count: 5 })).toBe(5);
  });

  it("clamps a negative 'set' to zero", () => {
    expect(unreadMessagesReducer(3, { type: "set", count: -2 })).toBe(0);
  });

  it("applies a positive delta", () => {
    expect(unreadMessagesReducer(2, { type: "delta", amount: 1 })).toBe(3);
  });

  it("applies a negative delta", () => {
    expect(unreadMessagesReducer(2, { type: "delta", amount: -1 })).toBe(1);
  });

  it("never goes negative from a delta", () => {
    expect(unreadMessagesReducer(1, { type: "delta", amount: -5 })).toBe(0);
  });

  it("returns the state unchanged for an unknown action", () => {
    // @ts-expect-error deliberately invalid action for the default branch
    expect(unreadMessagesReducer(4, { type: "nope" })).toBe(4);
  });
});
