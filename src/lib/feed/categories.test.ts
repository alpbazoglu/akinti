import { describe, expect, it } from "vitest";

import {
  COMPOSITION_TAGS,
  EXPLORE_CATEGORIES,
  EXPLORE_CATEGORY_META,
  VOICE_TAGS,
  categoriesForTags,
  isOffsetPaginatedCategory,
  isTagMappedCategory,
  tagsForCategory,
} from "./categories";

describe("categoriesForTags", () => {
  it("maps a spoken-word tag to voices", () => {
    expect(categoriesForTags(["storytelling"])).toEqual(["voices"]);
  });

  it("maps the music tag to compositions", () => {
    expect(categoriesForTags(["music"])).toEqual(["compositions"]);
  });

  it("maps a Wave with both a voice and a composition tag to both categories", () => {
    expect(categoriesForTags(["music", "storytelling"])).toEqual(["voices", "compositions"]);
  });

  it("maps 'other' and unrecognised tags to neither category", () => {
    expect(categoriesForTags(["other"])).toEqual([]);
    expect(categoriesForTags(["some-freeform-tag"])).toEqual([]);
    expect(categoriesForTags([])).toEqual([]);
  });

  it("is case-insensitive, mirroring tagsSchema's lower-casing on write", () => {
    expect(categoriesForTags(["Music"])).toEqual(["compositions"]);
    expect(categoriesForTags(["ASMR"])).toEqual(["voices"]);
  });

  it("trims incidental whitespace", () => {
    expect(categoriesForTags([" music "])).toEqual(["compositions"]);
  });

  it("covers every declared voice and composition tag individually", () => {
    for (const tag of VOICE_TAGS) {
      expect(categoriesForTags([tag])).toEqual(["voices"]);
    }
    for (const tag of COMPOSITION_TAGS) {
      expect(categoriesForTags([tag])).toEqual(["compositions"]);
    }
  });
});

describe("tagsForCategory", () => {
  it("returns the voice tag list for voices", () => {
    expect(tagsForCategory("voices")).toBe(VOICE_TAGS);
  });

  it("returns the composition tag list for compositions", () => {
    expect(tagsForCategory("compositions")).toBe(COMPOSITION_TAGS);
  });
});

describe("isTagMappedCategory / isOffsetPaginatedCategory", () => {
  it("flags exactly voices and compositions as tag-mapped", () => {
    for (const category of EXPLORE_CATEGORIES) {
      expect(isTagMappedCategory(category)).toBe(category === "voices" || category === "compositions");
    }
  });

  it("flags exactly trending as offset-paginated", () => {
    for (const category of EXPLORE_CATEGORIES) {
      expect(isOffsetPaginatedCategory(category)).toBe(category === "trending");
    }
  });
});

describe("EXPLORE_CATEGORY_META", () => {
  it("has a meta entry for every declared category, keyed to itself", () => {
    for (const category of EXPLORE_CATEGORIES) {
      expect(EXPLORE_CATEGORY_META[category].key).toBe(category);
      expect(EXPLORE_CATEGORY_META[category].label.length).toBeGreaterThan(0);
    }
  });
});
