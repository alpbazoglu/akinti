import { z } from "zod";

import { BACKING_TRACK_LICENSES } from "@/types/domain";

import { uuidSchema } from "./common";

const genreTagsSchema = z.array(z.string().trim().toLowerCase().min(1).max(24)).max(8).default([]);

/**
 * `list_backing_tracks` RPC input (`src/lib/db/backingTracks.ts`'s
 * `listBackingTracks`) — spec §4. `cursor` is opaque (see the RPC's own
 * comment in `supabase/migrations/20260905110000_backing_tracks.sql`) and
 * deliberately unvalidated beyond "a string" — a malformed/foreign cursor is
 * handled server-side by falling back to the first page, never by rejecting
 * the request.
 */
export const listBackingTracksSchema = z.object({
  genre: z.string().trim().toLowerCase().min(1).max(24).nullish(),
  musicalKey: z.string().trim().min(1).max(24).nullish(),
  bpmMin: z.number().int().min(20).max(300).nullish(),
  bpmMax: z.number().int().min(20).max(300).nullish(),
  cursor: z.string().min(1).max(200).nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

/**
 * Mirrors the `backing_tracks` CHECK constraints exactly
 * (`backing_tracks_title_len`, `_artist_credit_len`, `_genre_tags_len`,
 * `_bpm_valid`, `_duration_valid`, `_cc_by_requires_source` — migration
 * 20260905110000) — a user uploading their own instrumental as "open for
 * vocals" (spec §4). Curated/seeded tracks bypass this schema entirely
 * (`scripts/seed-backing-tracks.ts` writes rows directly with the service
 * role) since they are never user input.
 */
export const uploadBackingTrackSchema = z
  .object({
    title: z.string().trim().min(1, "validation.trackTitleRequired").max(120),
    artistCredit: z.string().trim().min(1, "validation.trackArtistRequired").max(120),
    // owner_upload is the expected value for a self-uploaded track; cc0/cc_by
    // remain selectable for someone re-uploading a track they have the right
    // to share under one of those licenses.
    license: z.enum(BACKING_TRACK_LICENSES),
    sourceUrl: z.string().trim().url().max(500).nullish(),
    audioAssetId: uuidSchema,
    bpm: z.number().int().min(20).max(300).nullish(),
    musicalKey: z.string().trim().min(1).max(24).nullish(),
    genreTags: genreTagsSchema,
    openForVocals: z.boolean().default(true),
  })
  .refine((value) => value.license !== "cc_by" || Boolean(value.sourceUrl), {
    // backing_tracks_cc_by_requires_source (migration 20260905110000):
    // attribution is not optional under CC-BY.
    message: "validation.trackAttributionRequired",
    path: ["sourceUrl"],
  });

export type ListBackingTracksInput = z.infer<typeof listBackingTracksSchema>;
export type UploadBackingTrackInput = z.infer<typeof uploadBackingTrackSchema>;
