import { describe, expect, it } from "vitest";

import { deriveGenreHue, genreHueForTag, mostUsedTag } from "./genreHue";

describe("mostUsedTag", () => {
  it("returns null for no tags at all", () => {
    expect(mostUsedTag([])).toBeNull();
    expect(mostUsedTag([[], []])).toBeNull();
  });

  it("ignores empty and whitespace-only tags", () => {
    expect(mostUsedTag([["", "  ", "pop"]])).toBe("pop");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(mostUsedTag([[" Pop "], ["POP"], ["rock"]])).toBe("pop");
  });

  it("picks the tag used most across multiple Waves' tag lists", () => {
    const tagLists = [["rock"], ["pop"], ["pop"], ["pop", "rock"]];
    expect(mostUsedTag(tagLists)).toBe("pop");
  });

  it("keeps the first-seen tag on a tie, for a stable result", () => {
    expect(mostUsedTag([["rock"], ["pop"]])).toBe("rock");
  });
});

describe("genreHueForTag", () => {
  it("returns undefined for null or an unrecognised tag", () => {
    expect(genreHueForTag(null)).toBeUndefined();
    expect(genreHueForTag("lo-fi")).toBeUndefined();
    expect(genreHueForTag("")).toBeUndefined();
  });

  it("maps every recognised genre keyword", () => {
    expect(genreHueForTag("pop")).toBe("genre-pop");
    expect(genreHueForTag("rap")).toBe("genre-rap");
    expect(genreHueForTag("trap")).toBe("genre-rap");
    expect(genreHueForTag("hip-hop")).toBe("genre-rap");
    expect(genreHueForTag("arabesk")).toBe("genre-arabesk");
    expect(genreHueForTag("türkü")).toBe("genre-turku");
    expect(genreHueForTag("turku")).toBe("genre-turku");
    expect(genreHueForTag("halk")).toBe("genre-turku");
    expect(genreHueForTag("folk")).toBe("genre-turku");
    expect(genreHueForTag("rock")).toBe("genre-rock");
    expect(genreHueForTag("metal")).toBe("genre-rock");
  });

  it("matches as a substring so a specific hashtag still resolves", () => {
    expect(genreHueForTag("turkpop")).toBe("genre-pop");
    expect(genreHueForTag("softrock")).toBe("genre-rock");
  });

  it("is case-insensitive", () => {
    expect(genreHueForTag("POP")).toBe("genre-pop");
    expect(genreHueForTag("Arabesk")).toBe("genre-arabesk");
  });
});

describe("deriveGenreHue", () => {
  it("derives the hue from the most-used tag across a creator's Waves", () => {
    const tagLists = [["pop", "duet"], ["pop"], ["rock"]];
    expect(deriveGenreHue(tagLists)).toBe("genre-pop");
  });

  it("returns undefined when there are no tags", () => {
    expect(deriveGenreHue([])).toBeUndefined();
    expect(deriveGenreHue([[], []])).toBeUndefined();
  });

  it("returns undefined when the most-used tag names no genre — never a wrong guess", () => {
    expect(deriveGenreHue([["acoustic"], ["acoustic"], ["live"]])).toBeUndefined();
  });
});
