import { describe, expect, it } from "vitest";

import { publishWaveSchema } from "./waves";

const VALID_ASSET_ID = "11111111-1111-4111-8111-111111111111";

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    assetId: VALID_ASSET_ID,
    title: "My first Wave",
    creationType: "recorded",
    ...overrides,
  };
}

describe("publishWaveSchema", () => {
  it("accepts the minimal valid input and fills in defaults", () => {
    const result = publishWaveSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe("everyone");
      expect(result.data.commentPermission).toBeNull();
      expect(result.data.duetPermission).toBeNull();
      expect(result.data.collaboratorUsernames).toEqual([]);
      expect(result.data.categories).toEqual([]);
    }
  });

  it("rejects a missing title", () => {
    const result = publishWaveSchema.safeParse(baseInput({ title: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects a title over the length limit", () => {
    const result = publishWaveSchema.safeParse(baseInput({ title: "a".repeat(121) }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid asset id", () => {
    const result = publishWaveSchema.safeParse(baseInput({ assetId: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });

  it("rejects creationType 'duet' — a Duet is never published through this schema", () => {
    const result = publishWaveSchema.safeParse(baseInput({ creationType: "duet" }));
    expect(result.success).toBe(false);
  });

  it("accepts every valid visibility value", () => {
    for (const visibility of ["everyone", "followers", "only_me"]) {
      expect(publishWaveSchema.safeParse(baseInput({ visibility })).success).toBe(true);
    }
  });

  it("accepts duetPermission 'following' but rejects it for commentPermission", () => {
    expect(
      publishWaveSchema.safeParse(baseInput({ duetPermission: "following" })).success,
    ).toBe(true);
    expect(
      publishWaveSchema.safeParse(baseInput({ commentPermission: "following" })).success,
    ).toBe(false);
  });

  it("lower-cases and de-duplicates-by-trim collaborator usernames", () => {
    const result = publishWaveSchema.safeParse(
      baseInput({ collaboratorUsernames: ["  Alice ", "BOB"] }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.collaboratorUsernames).toEqual(["alice", "bob"]);
    }
  });

  it("rejects more than 8 collaborators", () => {
    const usernames = Array.from({ length: 9 }, (_, i) => `user${i}`);
    const result = publishWaveSchema.safeParse(baseInput({ collaboratorUsernames: usernames }));
    expect(result.success).toBe(false);
  });

  it("caps categories at 8 and lower-cases them, mapping onto waves.tags", () => {
    const result = publishWaveSchema.safeParse(baseInput({ categories: ["Music", "Talk"] }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categories).toEqual(["music", "talk"]);
    }
  });
});
