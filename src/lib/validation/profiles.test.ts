import { describe, expect, it } from "vitest";

import {
  blockSchema,
  deleteAccountSchema,
  followSchema,
  respondToFollowRequestSchema,
  updateAccountSchema,
  updateAppearanceSchema,
  updateAvatarSchema,
  updatePrivacySchema,
  updateProfileSchema,
} from "./profiles";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("updateAccountSchema", () => {
  it("accepts a valid identity payload", () => {
    const result = updateAccountSchema.safeParse({
      username: "maria_lopez",
      display_name: "Maria Lopez",
      bio: "Singer, songwriter.",
    });
    expect(result.success).toBe(true);
  });

  it("lowercases and trims the username", () => {
    const result = updateAccountSchema.parse({
      username: "  Maria_Lopez  ",
      display_name: null,
      bio: null,
    });
    expect(result.username).toBe("maria_lopez");
  });

  it("rejects an invalid username", () => {
    expect(
      updateAccountSchema.safeParse({ username: "ab", display_name: null, bio: null }).success,
    ).toBe(false);
    expect(
      updateAccountSchema.safeParse({ username: "Has Spaces", display_name: null, bio: null })
        .success,
    ).toBe(false);
  });

  it("normalises an empty display name/bio to null", () => {
    const result = updateAccountSchema.parse({ username: "akin", display_name: "", bio: "" });
    expect(result.display_name).toBeNull();
    expect(result.bio).toBeNull();
  });

  it("rejects a bio over 500 characters", () => {
    const result = updateAccountSchema.safeParse({
      username: "akin",
      display_name: null,
      bio: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("updateAvatarSchema", () => {
  it("accepts a public storage URL", () => {
    expect(
      updateAvatarSchema.safeParse({ avatar_url: "https://example.com/avatars/u1/pic.jpg" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-URL value", () => {
    expect(updateAvatarSchema.safeParse({ avatar_url: "not-a-url" }).success).toBe(false);
  });
});

describe("updatePrivacySchema", () => {
  const valid = {
    privacy: "private",
    message_permission: "followers",
    duet_permission: "everyone",
    comment_permission: "nobody",
    default_wave_visibility: "followers",
  } as const;

  it("accepts a full, valid payload", () => {
    expect(updatePrivacySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid comment_permission value ('following' is duet/message-only)", () => {
    expect(
      updatePrivacySchema.safeParse({ ...valid, comment_permission: "following" }).success,
    ).toBe(false);
  });

  it("rejects a missing field", () => {
    const { privacy, ...rest } = valid;
    void privacy;
    expect(updatePrivacySchema.safeParse(rest).success).toBe(false);
  });
});

describe("updateAppearanceSchema", () => {
  it("accepts a curated signature hue", () => {
    expect(updateAppearanceSchema.safeParse({ signature_hue: "genre-turku" }).success).toBe(true);
  });

  it("accepts null (no explicit choice)", () => {
    expect(updateAppearanceSchema.safeParse({ signature_hue: null }).success).toBe(true);
  });

  it("rejects an uncurated hue value", () => {
    expect(updateAppearanceSchema.safeParse({ signature_hue: "violet" }).success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial patch", () => {
    expect(updateProfileSchema.safeParse({ bio: "hello" }).success).toBe(true);
  });
});

describe("deleteAccountSchema", () => {
  it("accepts a plausible handle", () => {
    expect(deleteAccountSchema.safeParse({ confirmHandle: "maria_lopez" }).success).toBe(true);
  });

  it("trims and lowercases, like a real handle", () => {
    const result = deleteAccountSchema.parse({ confirmHandle: "  Maria_Lopez  " });
    expect(result.confirmHandle).toBe("maria_lopez");
  });

  it("rejects a handle shorter than the minimum a real username could be", () => {
    expect(deleteAccountSchema.safeParse({ confirmHandle: "ab" }).success).toBe(false);
  });

  it("rejects a value that isn't a valid handle shape (spaces, symbols)", () => {
    expect(deleteAccountSchema.safeParse({ confirmHandle: "not a handle!" }).success).toBe(false);
  });

  it("rejects a missing confirmHandle", () => {
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
  });
});

describe("follow / block / respond schemas", () => {
  it("followSchema requires a uuid", () => {
    expect(followSchema.safeParse({ followeeId: VALID_UUID }).success).toBe(true);
    expect(followSchema.safeParse({ followeeId: "not-a-uuid" }).success).toBe(false);
  });

  it("blockSchema requires a uuid", () => {
    expect(blockSchema.safeParse({ blockedId: VALID_UUID }).success).toBe(true);
    expect(blockSchema.safeParse({ blockedId: "nope" }).success).toBe(false);
  });

  it("respondToFollowRequestSchema requires a uuid and boolean", () => {
    expect(
      respondToFollowRequestSchema.safeParse({ followerId: VALID_UUID, accept: true }).success,
    ).toBe(true);
    expect(
      respondToFollowRequestSchema.safeParse({ followerId: VALID_UUID, accept: "yes" }).success,
    ).toBe(false);
  });
});
