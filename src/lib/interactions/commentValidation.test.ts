import { describe, expect, it } from "vitest";

import { COMMENT_MAX_LENGTH, createCommentSchema, updateCommentSchema } from "@/lib/validation/waves";

const WAVE_ID = "11111111-1111-4111-8111-111111111111";
const COMMENT_ID = "22222222-2222-4222-8222-222222222222";

describe("createCommentSchema", () => {
  it("accepts a root comment and defaults parent_comment_id to null", () => {
    const result = createCommentSchema.safeParse({ wave_id: WAVE_ID, body: "Love this Wave" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parent_comment_id).toBeNull();
    }
  });

  it("accepts a reply with an explicit parent_comment_id", () => {
    const result = createCommentSchema.safeParse({
      wave_id: WAVE_ID,
      body: "Agreed!",
      parent_comment_id: COMMENT_ID,
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from the body", () => {
    const result = createCommentSchema.safeParse({ wave_id: WAVE_ID, body: "  hi there  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("hi there");
    }
  });

  it("rejects an empty body", () => {
    expect(createCommentSchema.safeParse({ wave_id: WAVE_ID, body: "" }).success).toBe(false);
  });

  it("rejects a body that is only whitespace", () => {
    expect(createCommentSchema.safeParse({ wave_id: WAVE_ID, body: "   " }).success).toBe(false);
  });

  it("accepts a body exactly at the max length", () => {
    const body = "a".repeat(COMMENT_MAX_LENGTH);
    expect(createCommentSchema.safeParse({ wave_id: WAVE_ID, body }).success).toBe(true);
  });

  it("rejects a body over the max length — mirrors the comments_body_len CHECK constraint", () => {
    const body = "a".repeat(COMMENT_MAX_LENGTH + 1);
    expect(createCommentSchema.safeParse({ wave_id: WAVE_ID, body }).success).toBe(false);
  });

  it("rejects an invalid wave_id", () => {
    expect(createCommentSchema.safeParse({ wave_id: "not-a-uuid", body: "hi" }).success).toBe(false);
  });

  it("rejects an invalid parent_comment_id", () => {
    const result = createCommentSchema.safeParse({
      wave_id: WAVE_ID,
      body: "hi",
      parent_comment_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCommentSchema", () => {
  it("accepts a valid edit", () => {
    const result = updateCommentSchema.safeParse({ comment_id: COMMENT_ID, body: "edited" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(updateCommentSchema.safeParse({ comment_id: COMMENT_ID, body: "" }).success).toBe(false);
  });
});
