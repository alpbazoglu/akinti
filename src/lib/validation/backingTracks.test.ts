import { describe, expect, it } from "vitest";

import { listBackingTracksSchema, uploadBackingTrackSchema } from "./backingTracks";

const VALID_ASSET_ID = "11111111-1111-4111-8111-111111111111";

describe("listBackingTracksSchema", () => {
  it("accepts an empty filter set and defaults limit to 20", () => {
    const result = listBackingTracksSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data.limit).toBe(20);
  });

  it("accepts a full filter set", () => {
    const result = listBackingTracksSchema.safeParse({
      genre: "Pop",
      musicalKey: "A minor",
      bpmMin: 80,
      bpmMax: 140,
      cursor: "2026-09-01T00:00:00Z|22222222-2222-2222-2222-222222222222",
      limit: 10,
    });
    expect(result.success).toBe(true);
    // Genre is lowercased for matching against genre_tags (stored lowercase).
    expect(result.success && result.data.genre).toBe("pop");
  });

  it("rejects a bpm outside 20-300", () => {
    expect(listBackingTracksSchema.safeParse({ bpmMin: 5 }).success).toBe(false);
    expect(listBackingTracksSchema.safeParse({ bpmMax: 500 }).success).toBe(false);
  });

  it("rejects a limit above 50", () => {
    expect(listBackingTracksSchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});

describe("uploadBackingTrackSchema", () => {
  const base = {
    title: "Late Night Groove",
    artistCredit: "Me",
    audioAssetId: VALID_ASSET_ID,
  };

  it("accepts an owner_upload with no source URL", () => {
    const result = uploadBackingTrackSchema.safeParse({ ...base, license: "owner_upload" });
    expect(result.success).toBe(true);
  });

  it("accepts a cc0 track with no source URL", () => {
    const result = uploadBackingTrackSchema.safeParse({ ...base, license: "cc0" });
    expect(result.success).toBe(true);
  });

  it("rejects a cc_by track with no source URL (attribution is not optional)", () => {
    const result = uploadBackingTrackSchema.safeParse({ ...base, license: "cc_by" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["sourceUrl"]);
    }
  });

  it("accepts a cc_by track that includes a source URL", () => {
    const result = uploadBackingTrackSchema.safeParse({
      ...base,
      license: "cc_by",
      sourceUrl: "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200083",
    });
    expect(result.success).toBe(true);
  });

  it("defaults openForVocals to true", () => {
    const result = uploadBackingTrackSchema.safeParse({ ...base, license: "owner_upload" });
    expect(result.success && result.data.openForVocals).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = uploadBackingTrackSchema.safeParse({ ...base, title: "", license: "owner_upload" });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 genre tags", () => {
    const result = uploadBackingTrackSchema.safeParse({
      ...base,
      license: "owner_upload",
      genreTags: Array.from({ length: 9 }, (_, i) => `genre${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid audioAssetId", () => {
    const result = uploadBackingTrackSchema.safeParse({ ...base, audioAssetId: "not-a-uuid", license: "owner_upload" });
    expect(result.success).toBe(false);
  });
});
