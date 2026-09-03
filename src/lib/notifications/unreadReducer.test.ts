import { describe, expect, it } from "vitest";

import { unreadReducer } from "./unreadReducer";

describe("unreadReducer", () => {
  it("sets the count outright", () => {
    expect(unreadReducer(0, { type: "set", count: 5 })).toBe(5);
    expect(unreadReducer(99, { type: "set", count: 3 })).toBe(3);
  });

  it("clamps a negative set to zero", () => {
    expect(unreadReducer(0, { type: "set", count: -4 })).toBe(0);
  });

  it("applies a positive delta", () => {
    expect(unreadReducer(2, { type: "delta", amount: 1 })).toBe(3);
    expect(unreadReducer(0, { type: "delta", amount: 3 })).toBe(3);
  });

  it("applies a negative delta without going below zero", () => {
    expect(unreadReducer(2, { type: "delta", amount: -1 })).toBe(1);
    expect(unreadReducer(1, { type: "delta", amount: -1 })).toBe(0);
    expect(unreadReducer(0, { type: "delta", amount: -1 })).toBe(0);
  });

  it("marks everything read", () => {
    expect(unreadReducer(12, { type: "markAllRead" })).toBe(0);
    expect(unreadReducer(0, { type: "markAllRead" })).toBe(0);
  });

  it("is a no-op for an unknown action", () => {
    // @ts-expect-error deliberately invalid action to exercise the default branch
    expect(unreadReducer(4, { type: "nope" })).toBe(4);
  });
});
