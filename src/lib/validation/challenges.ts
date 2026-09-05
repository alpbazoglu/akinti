import { z } from "zod";

import { CHALLENGE_STATUSES, DUET_MODES } from "@/types/domain";

import { uuidSchema } from "./common";

/** Mirrors `challenges_slug_format`/`challenges_slug_len` (migration 20260905130000). */
export const challengeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slug must be at least 3 characters")
  .max(80, "Slug must be at most 80 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and hyphens");

/** Mirrors `challenges_hashtag_format`/`challenges_hashtag_len`. Stored without a leading '#'. */
export const challengeHashtagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^#/, ""))
  .pipe(
    z
      .string()
      .min(2, "Hashtag must be at least 2 characters")
      .max(40, "Hashtag must be at most 40 characters")
      .regex(/^[a-z0-9_]+$/, "Hashtag may only contain lowercase letters, numbers and underscores"),
  );

export const challengeStatusSchema = z.enum(CHALLENGE_STATUSES);

export const enterChallengeSchema = z.object({
  challengeId: uuidSchema,
  waveId: uuidSchema,
  /** Only used to `revalidatePath(routes.challenge(slug))` on success — not sent to the database. */
  challengeSlug: challengeSlugSchema,
});

export const withdrawChallengeEntrySchema = z.object({
  challengeId: uuidSchema,
  waveId: uuidSchema,
  challengeSlug: challengeSlugSchema,
});

export const listChallengesSchema = z.object({
  status: challengeStatusSchema.nullish(),
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const listChallengeEntriesSchema = z.object({
  challengeId: uuidSchema,
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const listWavesByHashtagSchema = z.object({
  tag: challengeHashtagSchema,
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

/**
 * Moderator-only (`createChallenge`, `src/app/(app)/challenges/actions.ts`).
 * `endsAt` must be after `startsAt`, mirroring `challenges_date_order`.
 */
export const createChallengeSchema = z
  .object({
    slug: challengeSlugSchema,
    title: z.string().trim().min(1, "Give this challenge a title").max(120),
    brief: z.string().trim().min(1, "Give this challenge a brief").max(2000),
    hashtag: challengeHashtagSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    backingTrackId: uuidSchema.nullish(),
    duetMode: z.enum(DUET_MODES).nullish(),
    status: challengeStatusSchema.default("draft"),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The end date must be after the start date.",
        path: ["endsAt"],
      });
    }
  });

export const setChallengeStatusSchema = z.object({
  challengeId: uuidSchema,
  status: challengeStatusSchema,
});

export const upsertChallengePickSchema = z.object({
  challengeId: uuidSchema,
  waveId: uuidSchema,
  rank: z.number().int().min(1).max(5),
  note: z.string().trim().max(500).nullish(),
});

export const removeChallengePickSchema = z.object({
  challengeId: uuidSchema,
  rank: z.number().int().min(1).max(5),
});

export type EnterChallengeInput = z.infer<typeof enterChallengeSchema>;
export type WithdrawChallengeEntryInput = z.infer<typeof withdrawChallengeEntrySchema>;
export type ListChallengesInput = z.infer<typeof listChallengesSchema>;
export type ListChallengeEntriesInput = z.infer<typeof listChallengeEntriesSchema>;
export type ListWavesByHashtagInput = z.infer<typeof listWavesByHashtagSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type SetChallengeStatusInput = z.infer<typeof setChallengeStatusSchema>;
export type UpsertChallengePickInput = z.infer<typeof upsertChallengePickSchema>;
export type RemoveChallengePickInput = z.infer<typeof removeChallengePickSchema>;
