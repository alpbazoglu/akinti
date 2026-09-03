import { z } from "zod";

import { REPORT_REASONS } from "@/types/domain";

import { uuidSchema } from "./common";

/**
 * Filing a report. Exactly one target, matching `target_type` — mirrored by a
 * CHECK constraint on `reports`.
 */
export const createReportSchema = z.discriminatedUnion("target_type", [
  z.object({
    target_type: z.literal("wave"),
    target_wave_id: uuidSchema,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(1000).nullable().default(null),
  }),
  z.object({
    target_type: z.literal("comment"),
    target_comment_id: uuidSchema,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(1000).nullable().default(null),
  }),
  z.object({
    target_type: z.literal("profile"),
    target_profile_id: uuidSchema,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(1000).nullable().default(null),
  }),
  z.object({
    target_type: z.literal("message"),
    target_message_id: uuidSchema,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(1000).nullable().default(null),
  }),
]);

export const markNotificationsReadSchema = z.object({
  notificationIds: z.array(uuidSchema).max(200).nullable().default(null),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
