import { z } from "zod";

import { MAX_DUET_SEGMENTS, MAX_DUET_SEGMENTS_TOTAL_MS, validateDuetSegments } from "@/lib/duet/ffmpegChain";
import { MAX_AUDIO_DURATION_MS } from "@/lib/supabase/config";
import { AUDIO_ENHANCEMENT_PRESETS, DUET_MODES, WAVE_VISIBILITIES } from "@/types/domain";

import { advancedEqSettingsSchema } from "./audio";
import { cursorPageSchema, uuidSchema } from "./common";

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

/** Wave D. Mirrors `public.duet_mode` (migration 20260905120200). */
export const duetModeSchema = z.enum(DUET_MODES);

/** Wave D — one turn of an `atisma` (call-and-response) Duet. */
export const duetSegmentSchema = z.object({
  source: z.enum(["original", "contribution"]),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
});

/**
 * Wave D. Primary, user-facing enforcement of "monotonic, non-overlapping,
 * total <= max" — `validateDuetSegments` (`src/lib/duet/ffmpegChain.ts`) is
 * the same logic `validate_duet_segments()` (migration 20260905120200)
 * mirrors at the database level, so a request rejected here would also be
 * rejected by the trigger; this schema exists so the caller gets a specific,
 * readable Zod issue instead of a raw Postgres check_violation.
 */
export const duetSegmentsSchema = z
  .array(duetSegmentSchema)
  .min(1, "Add at least one turn.")
  .max(MAX_DUET_SEGMENTS, `An atışma Duet may have at most ${MAX_DUET_SEGMENTS} turns.`)
  .superRefine((segments, ctx) => {
    try {
      validateDuetSegments(segments);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "These segments aren't valid.",
      });
    }
  });

/**
 * `publishDuetWave` Server Action input (`src/app/(app)/create/duetActions.ts`).
 * `offsetMs` is intentionally signed — unlike `enqueueDuetMixSchema` in
 * `src/lib/validation/audio.ts` (which floors at 0), a Duet contribution may
 * genuinely start before the reference once the manual nudge is applied
 * (`src/lib/duet/sync.ts`). Everything else about the finished Wave (title,
 * description, visibility) mirrors `publishWaveSchema` in
 * `src/lib/validation/waves.ts` — duplicated here rather than imported so
 * this module has no dependency on a file owned by another agent.
 *
 * Wave D adds `mode` (default `'layer'`, the pre-existing behavior) and
 * `segments` (required exactly when `mode === 'atisma'`, validated above).
 * `cypherOrder` is never client-supplied — `waves_derive_duet_lineage`
 * derives it server-side from the parent, same as `duetDepth`.
 */
export const publishDuetWaveSchema = z
  .object({
    requestId: uuidSchema,
    contributionAssetId: uuidSchema,
    offsetMs: z.number().int().min(-MAX_AUDIO_DURATION_MS).max(MAX_AUDIO_DURATION_MS),
    title: z.string().trim().min(1, "Give this Duet a title").max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(WAVE_VISIBILITIES).default("everyone"),
    preset: z.enum(AUDIO_ENHANCEMENT_PRESETS).default("studio"),
    advancedEq: advancedEqSettingsSchema.nullish(),
    mode: duetModeSchema.default("layer"),
    segments: z.array(duetSegmentSchema).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "atisma") {
      const result = duetSegmentsSchema.safeParse(value.segments ?? []);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ ...issue, path: ["segments", ...issue.path] });
        }
      }
    } else if (value.segments && value.segments.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Segments are only used for an atışma Duet.",
        path: ["segments"],
      });
    }
  });

/* -------------------------------------------------------------------------- */
/* Open Calls (Wave D)                                                        */
/* -------------------------------------------------------------------------- */

export const setOpenCallSchema = z.object({
  waveId: uuidSchema,
  prompt: z.string().trim().max(500).nullable().optional(),
  /** ISO 8601. `null`/omitted means "no deadline". Must be in the future. */
  deadlineAt: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .refine((value) => !value || new Date(value).getTime() > Date.now(), {
      message: "The deadline must be in the future.",
    }),
});

export const closeOpenCallSchema = z.object({ waveId: uuidSchema });

export const answerOpenCallSchema = z.object({ waveId: uuidSchema });

export const listOpenCallsSchema = cursorPageSchema.extend({
  genre: z.string().trim().min(1).max(40).nullish(),
});

export type CreateDuetRequestInput = z.infer<typeof createDuetRequestSchema>;
export type RespondToDuetRequestInput = z.infer<typeof respondToDuetRequestSchema>;
export type CancelDuetRequestInput = z.infer<typeof cancelDuetRequestSchema>;
export type PublishDuetWaveInput = z.infer<typeof publishDuetWaveSchema>;
export type SetOpenCallInput = z.infer<typeof setOpenCallSchema>;
export type CloseOpenCallInput = z.infer<typeof closeOpenCallSchema>;
export type AnswerOpenCallInput = z.infer<typeof answerOpenCallSchema>;
export type ListOpenCallsInput = z.infer<typeof listOpenCallsSchema>;

// `MAX_DUET_SEGMENTS_TOTAL_MS` is re-exported so a UI (Wave A) that wants to
// show "X / 30:00 used" while building an atisma edit doesn't need to import
// from src/lib/duet directly.
export { MAX_DUET_SEGMENTS_TOTAL_MS };
