import { describe, expect, it } from "vitest";

import {
  markConversationReadSchema,
  openDirectConversationSchema,
  sendMessageSchema,
  setConversationMutedSchema,
} from "./messaging";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const WAVE_ID = "33333333-3333-4333-8333-333333333333";
const DUET_REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_PROFILE_ID = "55555555-5555-4555-8555-555555555555";

describe("sendMessageSchema", () => {
  it("accepts a valid text message", () => {
    const result = sendMessageSchema.safeParse({
      kind: "text",
      conversationId: CONVERSATION_ID,
      body: "Hello there",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a text message with an empty body", () => {
    const result = sendMessageSchema.safeParse({
      kind: "text",
      conversationId: CONVERSATION_ID,
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a text message whose body is only whitespace", () => {
    const result = sendMessageSchema.safeParse({
      kind: "text",
      conversationId: CONVERSATION_ID,
      body: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a text body over the 4000-character limit", () => {
    const result = sendMessageSchema.safeParse({
      kind: "text",
      conversationId: CONVERSATION_ID,
      body: "a".repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a text body at exactly the 4000-character limit", () => {
    const result = sendMessageSchema.safeParse({
      kind: "text",
      conversationId: CONVERSATION_ID,
      body: "a".repeat(4000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a text message with an invalid conversation id", () => {
    const result = sendMessageSchema.safeParse({
      kind: "text",
      conversationId: "not-a-uuid",
      body: "Hello",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid audio message and defaults body to null", () => {
    const result = sendMessageSchema.safeParse({
      kind: "audio",
      conversationId: CONVERSATION_ID,
      audioAssetId: ASSET_ID,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "audio") {
      expect(result.data.body).toBeNull();
    }
  });

  it("rejects an audio message with no audioAssetId", () => {
    const result = sendMessageSchema.safeParse({
      kind: "audio",
      conversationId: CONVERSATION_ID,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid wave_share message", () => {
    const result = sendMessageSchema.safeParse({
      kind: "wave_share",
      conversationId: CONVERSATION_ID,
      sharedWaveId: WAVE_ID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a wave_share message with no sharedWaveId", () => {
    const result = sendMessageSchema.safeParse({
      kind: "wave_share",
      conversationId: CONVERSATION_ID,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid duet_request message", () => {
    const result = sendMessageSchema.safeParse({
      kind: "duet_request",
      conversationId: CONVERSATION_ID,
      duetRequestId: DUET_REQUEST_ID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const result = sendMessageSchema.safeParse({
      kind: "sticker",
      conversationId: CONVERSATION_ID,
    });
    expect(result.success).toBe(false);
  });
});

describe("openDirectConversationSchema", () => {
  it("accepts a valid profile id", () => {
    expect(openDirectConversationSchema.safeParse({ otherProfileId: OTHER_PROFILE_ID }).success).toBe(true);
  });

  it("rejects an invalid profile id", () => {
    expect(openDirectConversationSchema.safeParse({ otherProfileId: "nope" }).success).toBe(false);
  });
});

describe("markConversationReadSchema", () => {
  it("accepts a valid conversation id", () => {
    expect(markConversationReadSchema.safeParse({ conversationId: CONVERSATION_ID }).success).toBe(true);
  });

  it("rejects a missing conversation id", () => {
    expect(markConversationReadSchema.safeParse({}).success).toBe(false);
  });
});

describe("setConversationMutedSchema", () => {
  it("accepts a valid mute toggle", () => {
    const result = setConversationMutedSchema.safeParse({ conversationId: CONVERSATION_ID, muted: true });
    expect(result.success).toBe(true);
  });

  it("rejects a non-boolean muted value", () => {
    const result = setConversationMutedSchema.safeParse({ conversationId: CONVERSATION_ID, muted: "yes" });
    expect(result.success).toBe(false);
  });
});
