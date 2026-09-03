import { z } from "zod";

import {
  COMMENT_AUDIENCES,
  CONTENT_ORIGINS,
  PERMISSION_AUDIENCES,
  SHARE_CHANNELS,
  WAVE_VISIBILITIES,
} from "@/types/domain";

import { uuidSchema } from "./common";

const titleSchema = z.string().trim().min(1, "A Wave needs a title").max(120);
const descriptionSchema = z.string().trim().max(2000).nullable();
const tagsSchema = z.array(z.string().trim().toLowerCase().min(1).max(24)).max(8);

/** Publishing a Recorded or Uploaded Wave. */
export const createWaveSchema = z.object({
  audio_asset_id: uuidSchema,
  title: titleSchema,
  description: descriptionSchema.optional(),
  creation_type: z.enum(["recorded", "uploaded"]),
  visibility: z.enum(WAVE_VISIBILITIES).default("everyone"),
  /** null = inherit the creator's profile setting. */
  comment_permission: z.enum(COMMENT_AUDIENCES).nullable().default(null),
  duet_permission: z.enum(PERMISSION_AUDIENCES).nullable().default(null),
  content_origin: z.enum(CONTENT_ORIGINS).default("original"),
  tags: tagsSchema.default([]),
});

/** Publishing the Wave that comes out of a Duet. */
export const createDuetWaveSchema = z.object({
  audio_asset_id: uuidSchema,
  duet_request_id: uuidSchema,
  parent_wave_id: uuidSchema,
  title: titleSchema,
  description: descriptionSchema.optional(),
  visibility: z.enum(WAVE_VISIBILITIES).default("everyone"),
  comment_permission: z.enum(COMMENT_AUDIENCES).nullable().default(null),
  duet_permission: z.enum(PERMISSION_AUDIENCES).nullable().default(null),
  content_origin: z.enum(CONTENT_ORIGINS).default("original"),
  tags: tagsSchema.default([]),
  /** Credit the other party as a Collaborator (they must accept). */
  collaborator_id: uuidSchema.optional(),
});

export const updateWaveSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    visibility: z.enum(WAVE_VISIBILITIES).optional(),
    comment_permission: z.enum(COMMENT_AUDIENCES).nullable().optional(),
    duet_permission: z.enum(PERMISSION_AUDIENCES).nullable().optional(),
    content_origin: z.enum(CONTENT_ORIGINS).optional(),
    tags: tagsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export const createCommentSchema = z.object({
  wave_id: uuidSchema,
  body: z.string().trim().min(1, "Say something").max(1000),
  parent_comment_id: uuidSchema.nullable().default(null),
});

export const updateCommentSchema = z.object({
  comment_id: uuidSchema,
  body: z.string().trim().min(1).max(1000),
});

export const saveWaveSchema = z.object({ waveId: uuidSchema });

export const shareWaveSchema = z.object({
  waveId: uuidSchema,
  channel: z.enum(SHARE_CHANNELS),
  conversationId: uuidSchema.nullable().default(null),
});

export const inviteCollaboratorSchema = z.object({
  waveId: uuidSchema,
  profileId: uuidSchema,
  role: z.string().trim().min(1).max(40).nullable().default(null),
});

/**
 * A raw playback report from the client.
 *
 * The client reports what happened; `record_play_event` decides whether it was
 * a Play or a Replay (spec s13). Nothing here is trusted as a metric.
 */
export const playbackReportSchema = z.object({
  waveId: uuidSchema,
  /** Stable per browser session; used to deduplicate anonymous listeners. */
  sessionId: z.string().min(8).max(64),
  listenedMs: z.number().int().min(0).max(6 * 60 * 60 * 1000),
  durationMs: z.number().int().positive().max(6 * 60 * 60 * 1000).optional(),
  completed: z.boolean().default(false),
});

export type CreateWaveInput = z.infer<typeof createWaveSchema>;
export type CreateDuetWaveInput = z.infer<typeof createDuetWaveSchema>;
export type UpdateWaveInput = z.infer<typeof updateWaveSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ShareWaveInput = z.infer<typeof shareWaveSchema>;
export type InviteCollaboratorInput = z.infer<typeof inviteCollaboratorSchema>;
export type PlaybackReportInput = z.infer<typeof playbackReportSchema>;
