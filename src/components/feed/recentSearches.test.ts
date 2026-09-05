import { describe, expect, it } from "vitest";

import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_KEY,
  readRecentSearches,
  withRecentSearch,
  withoutRecentSearch,
  writeRecentSearches,
} from "./recentSearches";

describe("withRecentSearch", () => {
  it("puts the newest search first", () => {
    expect(withRecentSearch(["ayşe"], "deniz")).toEqual(["deniz", "ayşe"]);
  });

  it("moves a repeated search back to the front instead of duplicating it", () => {
    expect(withRecentSearch(["ayşe", "deniz"], "deniz")).toEqual(["deniz", "ayşe"]);
  });

  it("treats case and surrounding space as the same search", () => {
    expect(withRecentSearch(["Sabah provası"], "  sabah provası ")).toEqual(["sabah provası"]);
  });

  it("ignores a blank query", () => {
    expect(withRecentSearch(["ayşe"], "   ")).toEqual(["ayşe"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `q${i}`);
    expect(withRecentSearch(many, "new")).toHaveLength(MAX_RECENT_SEARCHES);
    expect(withRecentSearch(many, "new")[0]).toBe("new");
  });
});

describe("withoutRecentSearch", () => {
  it("removes one entry, case-insensitively", () => {
    expect(withoutRecentSearch(["ayşe", "Deniz"], "deniz")).toEqual(["ayşe"]);
  });

  it("leaves the list alone when nothing matches", () => {
    expect(withoutRecentSearch(["ayşe"], "mert")).toEqual(["ayşe"]);
  });
});

describe("readRecentSearches / writeRecentSearches", () => {
  function fakeStorage(initial?: string) {
    const map = new Map<string, string>();
    if (initial !== undefined) map.set(RECENT_SEARCHES_KEY, initial);
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      read: () => map.get(RECENT_SEARCHES_KEY),
    };
  }

  it("round-trips a list", () => {
    const storage = fakeStorage();
    writeRecentSearches(storage, ["ayşe", "deniz"]);
    expect(readRecentSearches(storage)).toEqual(["ayşe", "deniz"]);
  });

  it("returns an empty list with no storage at all", () => {
    expect(readRecentSearches(null)).toEqual([]);
  });

  it("survives content that is not the shape we wrote", () => {
    expect(readRecentSearches(fakeStorage("not json"))).toEqual([]);
    expect(readRecentSearches(fakeStorage('{"q":1}'))).toEqual([]);
    expect(readRecentSearches(fakeStorage('["ok", 3, null]'))).toEqual(["ok"]);
  });

  it("never writes more than the cap", () => {
    const storage = fakeStorage();
    writeRecentSearches(
      storage,
      Array.from({ length: 30 }, (_, i) => `q${i}`),
    );
    expect(JSON.parse(storage.read() ?? "[]")).toHaveLength(MAX_RECENT_SEARCHES);
  });

  it("does not throw when storage refuses to write", () => {
    const hostile = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeRecentSearches(hostile, ["ayşe"])).not.toThrow();
  });
});
