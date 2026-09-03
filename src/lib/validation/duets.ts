import { z } from "zod";

import { MAX_AUDIO_DURATION_MS } from "@/lib/supabase/config";
import { AUDIO_ENHANCEMENT_PRESETS, WAVE_VISIBILITIES } from "@/types/domain";

import { advancedEqSettingsSchema } from "./audio";
import { uuidSchema } from "./common";

export const createDuetRequestSchema = z.object({
  waveId: uuidSchema,
  message: z.string().trim().max(500).nullable().default(null),
});

export const respondToDuetRequestSchema = z.object({
  requestId: uuidSchema,
  /** Only the recipient may accept or decline. */
  decision: z.enum(["accepted", "declined"]),
});

export const cancelDuetRequestSchema = z.object({ requestId: uuidSchema });

/**
 * `publishDuetWave` Server Action input (`src/app/(app)/create/duetActions.ts`).
 * `offsetMs` is intentionally signed — unlike `enqueueDuetMixSchema` in
 * `src/lib/validation/audio.ts` (which floors at 0), a Duet contribution may
 * genuinely start before the reference once the manual nudge is applied
 * (`src/lib/duet/sync.ts`). Everything else about the finished Wave (title,
 * description, visibility) mirrors `publishWaveSchema` in
 * `src/lib/validation/waves.ts` — duplicated here rather than imported so
 * this module has no dependency on a file owned by another agent.
 */
export const publishDuetWaveSchema = z.object({
  requestId: uuidSchema,
  contributionAssetId: uuidSchema,
  offsetMs: z.number().int().min(-MAX_AUDIO_DURATION_MS).max(MAX_AUDIO_DURATION_MS),
  title: z.string().trim().min(1, "Give this Duet a title").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  visibility: z.enum(WAVE_VISIBILITIES).default("everyone"),
  preset: z.enum(AUDIO_ENHANCEMENT_PRESETS).default("studio"),
  advancedEq: advancedEqSettingsSchema.nullish(),
});

export type CreateDuetRequestInput = z.infer<typeof createDuetRequestSchema>;
export type RespondToDuetRequestInput = z.infer<typeof respondToDuetRequestSchema>;
export type CancelDuetRequestInput = z.infer<typeof cancelDuetRequestSchema>;
export type PublishDuetWaveInput = z.infer<typeof publishDuetWaveSchema>;
