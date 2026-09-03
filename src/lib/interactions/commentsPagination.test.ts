import { describe, expect, it } from "vitest";

import { mergeCommentPage, prependComment, removeComment } from "./commentsPagination";

interface Item {
  id: string;
  body: string;
}

describe("mergeCommentPage", () => {
  it("appends a page with no overlap", () => {
    const existing: Item[] = [{ id: "a", body: "first" }];
    const incoming: Item[] = [{ id: "b", body: "second" }];
    expect(mergeCommentPage(existing, incoming)).toEqual([
      { id: "a", body: "first" },
      { id: "b", body: "second" },
    ]);
  });

  it("dedupes by id, keeping the existing copy", () => {
    const existing: Item[] = [{ id: "a", body: "optimistic" }];
    const incoming: Item[] = [{ id: "a", body: "from server" }];
    const merged = mergeCommentPage(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ id: "a", body: "optimistic" });
  });

  it("dedupes a page that overlaps only partially", () => {
    const existing: Item[] = [{ id: "a", body: "1" }, { id: "b", body: "2" }];
    const incoming: Item[] = [{ id: "b", body: "2 (again)" }, { id: "c", body: "3" }];
    expect(mergeCommentPage(existing, incoming).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the existing array", () => {
    const existing: Item[] = [{ id: "a", body: "1" }];
    mergeCommentPage(existing, [{ id: "b", body: "2" }]);
    expect(existing).toHaveLength(1);
  });
});

describe("prependComment", () => {
  it("adds the new comment to the front", () => {
    const existing: Item[] = [{ id: "a", body: "old" }];
    expect(prependComment(existing, { id: "b", body: "new" })).toEqual([
      { id: "b", body: "new" },
      { id: "a", body: "old" },
    ]);
  });

  it("is a no-op (besides copying) when the id already exists", () => {
    const existing: Item[] = [{ id: "a", body: "old" }];
    expect(prependComment(existing, { id: "a", body: "old" })).toEqual(existing);
  });
});

describe("removeComment", () => {
  it("removes the matching comment by id", () => {
    const existing: Item[] = [{ id: "a", body: "1" }, { id: "b", body: "2" }];
    expect(removeComment(existing, "a")).toEqual([{ id: "b", body: "2" }]);
  });

  it("is a no-op when the id is not present", () => {
    const existing: Item[] = [{ id: "a", body: "1" }];
    expect(removeComment(existing, "z")).toEqual(existing);
  });
});
