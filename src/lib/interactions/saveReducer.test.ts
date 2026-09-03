import { describe, expect, it } from "vitest";

import { saveReducer, type SaveState } from "./saveReducer";

const BASE: SaveState = { isSaved: false, saveCount: 4, status: "idle" };

describe("saveReducer", () => {
  it("optimistically saves: flips isSaved, increments the count, marks pending", () => {
    const next = saveReducer(BASE, { type: "toggle" });
    expect(next).toEqual({ isSaved: true, saveCount: 5, status: "pending" });
  });

  it("optimistically unsaves: flips isSaved, decrements the count", () => {
    const saved: SaveState = { isSaved: true, saveCount: 5, status: "idle" };
    const next = saveReducer(saved, { type: "toggle" });
    expect(next).toEqual({ isSaved: false, saveCount: 4, status: "pending" });
  });

  it("never lets the count go negative", () => {
    const empty: SaveState = { isSaved: true, saveCount: 0, status: "idle" };
    const next = saveReducer(empty, { type: "toggle" });
    expect(next.saveCount).toBe(0);
  });

  it("confirm clears the pending status without touching isSaved/count", () => {
    const pending: SaveState = { isSaved: true, saveCount: 5, status: "pending" };
    expect(saveReducer(pending, { type: "confirm" })).toEqual({
      isSaved: true,
      saveCount: 5,
      status: "idle",
    });
  });

  it("rollback undoes the optimistic toggle and reports an error", () => {
    const pending = saveReducer(BASE, { type: "toggle" });
    const rolledBack = saveReducer(pending, { type: "rollback" });
    expect(rolledBack).toEqual({ isSaved: false, saveCount: 4, status: "error" });
  });

  it("toggle then rollback is a full round trip back to the original count", () => {
    const optimistic = saveReducer(BASE, { type: "toggle" });
    const rolledBack = saveReducer(optimistic, { type: "rollback" });
    expect(rolledBack.isSaved).toBe(BASE.isSaved);
    expect(rolledBack.saveCount).toBe(BASE.saveCount);
  });
});
