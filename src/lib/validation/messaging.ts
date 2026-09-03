import { z } from "zod";

import { uuidSchema } from "./common";

export const openDirectConversationSchema = z.object({ otherProfileId: uuidSchema });

/**
 * One message. `kind` decides which payload field is required; the same rule is
 * enforced by a CHECK constraint on `messages`, so a malformed insert fails
 * even if it bypasses this schema.
 */
export const sendMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    conversationId: uuidSchema,
    body: z.string().trim().min(1).max(4000),
  }),
  z.object({
    kind: z.literal("audio"),
    conversationId: uuidSchema,
    audioAssetId: uuidSchema,
    body: z.string().trim().max(4000).nullable().default(null),
  }),
  z.object({
    kind: z.literal("wave_share"),
    conversationId: uuidSchema,
    sharedWaveId: uuidSchema,
    body: z.string().trim().max(4000).nullable().default(null),
  }),
  z.object({
    kind: z.literal("duet_request"),
    conversationId: uuidSchema,
    duetRequestId: uuidSchema,
    body: z.string().trim().max(4000).nullable().default(null),
  }),
]);

export const markConversationReadSchema = z.object({ conversationId: uuidSchema });

export const setConversationMutedSchema = z.object({
  conversationId: uuidSchema,
  muted: z.boolean(),
});

export type OpenDirectConversationInput = z.infer<typeof openDirectConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MarkConversationReadInput = z.infer<typeof markConversationReadSchema>;
export type SetConversationMutedInput = z.infer<typeof setConversationMutedSchema>;
