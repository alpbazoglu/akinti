import { z } from "zod";

import {
  COMMENT_AUDIENCES,
  CONTENT_ORIGINS,
  PERMISSION_AUDIENCES,
  SHARE_CHANNELS,
  WAVE_VISIBILITIES,
} from "@/types/domain";

import { uuidSchema } from "./common";
import { COMMENT_MAX_LENGTH } from "./limits";

export { COMMENT_MAX_LENGTH } from "./limits";

const titleSchema = z.string().trim().min(1, "validation.waveTitleRequired").max(120);
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
  /** Set when this Wave is a vocal recorded over a backing track (spec §4). */
  backing_track_id: uuidSchema.nullable().default(null),
  content_origin: z.enum(CONTENT_ORIGINS).default("original"),
  tags: tagsSchema.default([]),
});

const usernameListSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(30))
  .max(8)
  .default([]);

/**
 * `publishWave` Server Action input — the server-side counterpart of
 * `CreateWaveDraft` (`src/lib/audio/createDraft.ts`). `assetId` replaces
 * `audio_asset_id` naming to match the rest of the create-flow action
 * signatures; `categories` maps onto the existing `waves.tags` column (no
 * separate "categories" column exists — see docs/DATABASE.md).
 * `collaboratorUsernames` are invites, never memberships (spec §16): each is
 * resolved and invited independently by `publishWave`, and an unknown/
 * blocked username is skipped rather than failing the whole publish.
 */
export const publishWaveSchema = z.object({
  assetId: uuidSchema,
  title: titleSchema,
  description: descriptionSchema.optional(),
  creationType: z.enum(["recorded", "uploaded"]),
  visibility: z.enum(WAVE_VISIBILITIES).default("everyone"),
  commentPermission: z.enum(COMMENT_AUDIENCES).nullable().default(null),
  /**
   * `'everyone'` by default (fixDesktop P1, docs/qa/desktop/REPORT.md #1) —
   * a freshly published Wave a creator didn't touch the "Who can request a
   * Duet" select for is duet-requestable by anyone, matching
   * `profiles.duet_permission`'s own `not null default 'everyone'`, rather
   * than relying invisibly on `can_request_duet()`'s inheritance fallback.
   * `null` still means "inherit the creator's profile default" wherever a
   * caller (`WaveOwnerMenu`'s "use my profile default" option) explicitly
   * sends it.
   */
  duetPermission: z.enum(PERMISSION_AUDIENCES).nullable().default("everyone"),
  collaboratorUsernames: usernameListSchema,
  categories: tagsSchema.default([]),
  /**
   * Sing over a curated/open backing track (spec §4). When set, `publishWave`
   * creates the Wave with `backing_track_id` set (never `parent_wave_id` —
   * this is not a Duet of another Wave) and enqueues a `mix_duet` job that
   * mixes `assetId`'s vocal over the track's own audio asset, exactly like an
   * ordinary Duet mixdown, with the track gain-reduced by default. See
   * docs/AUDIO_ARCHITECTURE.md "Backing tracks".
   */
  backingTrackId: uuidSchema.nullable().default(null),
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
  .refine((value) => Object.keys(value).length > 0, { message: "validation.nothingToUpdate" });

export const createCommentSchema = z.object({
  wave_id: uuidSchema,
  body: z.string().trim().min(1, "validation.commentBodyRequired").max(COMMENT_MAX_LENGTH),
  parent_comment_id: uuidSchema.nullable().default(null),
});

export const updateCommentSchema = z.object({
  comment_id: uuidSchema,
  body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
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
export type PublishWaveInput = z.infer<typeof publishWaveSchema>;
export type CreateDuetWaveInput = z.infer<typeof createDuetWaveSchema>;
export type UpdateWaveInput = z.infer<typeof updateWaveSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ShareWaveInput = z.infer<typeof shareWaveSchema>;
export type InviteCollaboratorInput = z.infer<typeof inviteCollaboratorSchema>;
export type PlaybackReportInput = z.infer<typeof playbackReportSchema>;
