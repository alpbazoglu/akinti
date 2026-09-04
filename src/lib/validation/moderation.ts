import { z } from "zod";

import { MODERATION_ACTION_TYPES, NOTIFICATION_CATEGORIES, REPORT_REASONS } from "@/types/domain";

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

/**
 * Settings → Notifications (spec §23, §25). Mirrors the DB CHECK constraint
 * (`profiles_notification_preferences_valid`, migration 22) exactly — every
 * key optional, `undefined`/missing means "on". Rejecting an unknown key
 * here gives an honest client-side error instead of a raw Postgres
 * constraint violation.
 */
export const notificationPreferencesSchema = z
  .object({
    message: z.boolean().optional(),
    duet: z.boolean().optional(),
    comment: z.boolean().optional(),
    follower: z.boolean().optional(),
    system: z.boolean().optional(),
  })
  .strict();

/**
 * Moderation queue (spec §26). `resolve_report`'s v1 actions; `note` is
 * optional context recorded on the audit trail (`moderation_actions`).
 */
export const resolveReportSchema = z.object({
  reportId: uuidSchema,
  action: z.enum(MODERATION_ACTION_TYPES),
  note: z.string().trim().max(1000).nullable().default(null),
});

export const dismissReportSchema = z.object({
  reportId: uuidSchema,
  note: z.string().trim().max(1000).nullable().default(null),
});

export const claimReportSchema = z.object({
  reportId: uuidSchema,
});

/** Moderation queue filters (spec §26 "filters: state, target type, reason"). */
export const moderationQueueFiltersSchema = z.object({
  status: z.enum(["open", "reviewing", "actioned", "dismissed"]).nullable().default(null),
  targetType: z.enum(["wave", "comment", "profile", "message"]).nullable().default(null),
  reason: z.enum(REPORT_REASONS).nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().datetime().nullable().default(null),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type DismissReportInput = z.infer<typeof dismissReportSchema>;
export type ClaimReportInput = z.infer<typeof claimReportSchema>;
export type ModerationQueueFilters = z.infer<typeof moderationQueueFiltersSchema>;

/** Runtime check mirroring `NOTIFICATION_CATEGORIES` — used by the settings form so a rename can't silently drift. */
export const NOTIFICATION_CATEGORY_KEYS = NOTIFICATION_CATEGORIES;
