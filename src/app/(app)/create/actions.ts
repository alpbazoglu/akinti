"use server";

/**
 * Server Actions backing the Wave creation flow (spec §17, §18, §19, §36,
 * §38). Sequence: `createUploadTicket` -> client uploads the blob straight to
 * storage -> `finalizeUpload` -> `publishWave` -> redirect to `/w/[id]`. See
 * `CreateFlow.tsx` for how the client drives this and
 * `docs/AUDIO_ARCHITECTURE.md` "Upload sequence" for the full write-up.
 *
 * Every action here follows the same contract as `src/app/(auth)/actions.ts`:
 * parse with Zod, never throw to the client, always return a typed
 * `{ ok, ... }` result — no fake success (spec §38, §44).
 */

import { randomUUID } from "node:crypto";

import {
  createAudioAsset,
  enqueueAudioProcessing,
  getAudioAssetById,
  markAudioAssetFailed,
} from "@/lib/db/audioAssets";
import { enqueueBackingTrackMixJob, requireBackingTrack } from "@/lib/db/backingTracks";
import { createWave, inviteCollaborator } from "@/lib/db/waves";
import { getProfileByUsername } from "@/lib/db/profiles";
import { DatabaseError, ForbiddenError, NotFoundError } from "@/lib/db/types";
import { assertNotSuspended, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/moderation/errors";
import { sniffAudioKind } from "@/lib/audio/validateFile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AUDIO_BUCKET,
  audioOriginalPath,
  extensionForAudioMimeType,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import {
  createUploadTicketSchema,
  finalizeUploadSchema,
  type AdvancedEqSettingsInput,
} from "@/lib/validation/audio";
import { publishWaveSchema } from "@/lib/validation/waves";
import type { PermissionAudience } from "@/types/domain";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const SIGN_IN_ERROR = "Sign in to do that.";

export interface ActionFailure {
  readonly ok: false;
  readonly error: string;
}

/** Turn a thrown `src/lib/db` error into a message safe to show a user. Never forwards a raw Postgres error string. */
function describeError(err: unknown, fallback: string): string {
  if (isRateLimitError(err)) {
    return RATE_LIMIT_MESSAGE;
  }
  if (err instanceof NotFoundError) {
    return "That recording could not be found.";
  }
  if (err instanceof ForbiddenError) {
    return "You don't have permission to do that.";
  }
  if (err instanceof DatabaseError) {
    return fallback;
  }
  return fallback;
}

/* ------------------------------------------------------------------------ */
/* 1. createUploadTicket                                                    */
/* ------------------------------------------------------------------------ */

export interface CreateUploadTicketSuccess {
  readonly ok: true;
  readonly assetId: string;
  /** PUT the file body here (see `uploadRecording` in `CreateFlow.tsx`). */
  readonly uploadUrl: string;
  readonly uploadToken: string;
  readonly path: string;
}

export type CreateUploadTicketResult = CreateUploadTicketSuccess | ActionFailure;

export interface CreateUploadTicketArgs {
  mimeType: string;
  sizeBytes: number;
  durationMs?: number | null;
  creationType: "recorded" | "uploaded";
  enhancementPreset?: string;
}

/**
 * Step 1: register an `audio_assets` row (status `pending` — there is no
 * separate "uploading" DB state; the client tracks upload progress itself)
 * and hand back a signed upload URL for the private `audio` bucket. Limits
 * are re-validated here from `src/lib/supabase/config.ts`, independent of
 * whatever the client's own `validateFile()` already checked.
 */
export async function createUploadTicket(
  args: CreateUploadTicketArgs,
): Promise<CreateUploadTicketResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = createUploadTicketSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "This file can't be uploaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const assetId = randomUUID();
  const extension = extensionForAudioMimeType(parsed.data.mimeType);
  const originalPath = audioOriginalPath(user.id, assetId, extension);

  try {
    await createAudioAsset(db, user.id, {
      id: assetId,
      original_path: originalPath,
      mime_type: parsed.data.mimeType,
      byte_size: parsed.data.sizeBytes,
      duration_ms: parsed.data.durationMs ?? null,
      enhancement_preset: parsed.data.enhancementPreset,
    });
  } catch (err) {
    return { ok: false, error: describeError(err, "We couldn't start this upload. Try again.") };
  }

  // The signed-upload token embeds authorization for exactly this path; it
  // does not need the admin client (RLS permissions required: none — see
  // @supabase/storage-js's `uploadToSignedUrl` doc comment). Minted with the
  // caller's own client, scoped to a path the storage policies already let
  // this owner write to (migration 13).
  const { data: signed, error: signError } = await db.storage
    .from(AUDIO_BUCKET)
    .createSignedUploadUrl(originalPath);

  if (signError || !signed) {
    return { ok: false, error: "We couldn't prepare an upload slot. Try again." };
  }

  return {
    ok: true,
    assetId,
    uploadUrl: signed.signedUrl,
    uploadToken: signed.token,
    path: originalPath,
  };
}

/* ------------------------------------------------------------------------ */
/* 2. finalizeUpload                                                        */
/* ------------------------------------------------------------------------ */

export interface FinalizeUploadSuccess {
  readonly ok: true;
  readonly assetId: string;
}

export type FinalizeUploadResult = FinalizeUploadSuccess | ActionFailure;

/**
 * Step 2: the client has PUT the file to the signed URL. Read the head bytes
 * back with the admin client and independently sniff the magic bytes (spec
 * §18: "never trust client-provided MIME types alone") — `sniffAudioKind` is
 * the same pure, isomorphic function `validateFile()` uses client-side, run
 * again here as the actual security boundary. On success, enqueue real
 * processing; on failure, mark the asset `failed` with a reason (never a
 * silent/fake success).
 *
 * `skipAutoProcessing` (default `false`): pass `true` only for a Duet
 * contribution stem (`DuetRecorder.tsx`) — `publishDuetWave`
 * (`./duetActions.ts`) enqueues a `mix_duet` job for the same asset right
 * after this call returns, and that job already applies the chosen
 * preset/EQ as part of the mixdown. Enqueuing the ordinary `process_audio`
 * job too would race it for the same `audio_assets` row (see
 * `docs/AUDIO_ARCHITECTURE.md` "Duet mixdown" and `docs/DUET_SPEC.md`). The
 * magic-byte validation below still always runs — only the processing job
 * is conditional.
 */
export async function finalizeUpload(
  assetId: string,
  advancedEq?: AdvancedEqSettingsInput | null,
  skipAutoProcessing?: boolean,
): Promise<FinalizeUploadResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = finalizeUploadSchema.safeParse({ assetId, advancedEq, skipAutoProcessing });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const asset = await getAudioAssetById(db, parsed.data.assetId).catch(() => null);
  if (!asset || asset.ownerId !== user.id) {
    return { ok: false, error: "That upload could not be found." };
  }
  if (asset.processingStatus !== "pending") {
    // Already finalized (or already failed) — finalizing twice is a no-op,
    // not an error, so a client retry after a dropped response is safe.
    return { ok: true, assetId: asset.id };
  }

  const admin = createAdminClient();

  const { data: pathRow, error: pathError } = await admin
    .from("audio_assets")
    .select("original_path")
    .eq("id", asset.id)
    .maybeSingle();
  if (pathError || !pathRow) {
    return { ok: false, error: "That upload could not be found." };
  }

  const { data: signed, error: signError } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(pathRow.original_path, 60);
  if (signError || !signed) {
    return { ok: false, error: "We couldn't read the uploaded file. Try uploading again." };
  }

  let headBytes: Uint8Array;
  try {
    const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-63" } });
    if (!response.ok) {
      throw new Error(`unexpected status ${response.status}`);
    }
    headBytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return {
      ok: false,
      error: "The upload did not complete. Try uploading again.",
    };
  }

  const kind = sniffAudioKind(headBytes);
  if (!kind) {
    await markAudioAssetFailed(
      admin,
      asset.id,
      "Uploaded file does not look like a supported audio format.",
    ).catch(() => {
      // Best-effort — the upload is rejected to the client either way.
    });
    return {
      ok: false,
      error: "This file doesn't look like a supported audio format. Try a different file.",
    };
  }

  if (!parsed.data.skipAutoProcessing) {
    try {
      await enqueueAudioProcessing(db, asset.id, asset.enhancementPreset, parsed.data.advancedEq);
    } catch (err) {
      return { ok: false, error: describeError(err, "We couldn't queue processing. Try again.") };
    }
  }
  // else: a Duet contribution stem — `publishDuetWave` (`./duetActions.ts`)
  // enqueues the `mix_duet` job for this asset next, which applies the
  // preset/EQ itself. The asset legitimately stays `processing_status =
  // 'pending'` until that job completes; `mintPlaybackUrl` already falls
  // back to `original_path` while pending, so nothing plays a fake "ready"
  // file in the meantime (spec §44).

  return { ok: true, assetId: asset.id };
}

/* ------------------------------------------------------------------------ */
/* 3. publishWave                                                           */
/* ------------------------------------------------------------------------ */

export interface PublishWaveSuccess {
  readonly ok: true;
  readonly waveId: string;
  /** Usernames that could not be invited (unknown, self, or blocked) — publish still succeeds. */
  readonly skippedCollaborators: readonly string[];
}

export type PublishWaveResult = PublishWaveSuccess | ActionFailure;

export interface PublishWaveArgs {
  assetId: string;
  title: string;
  description?: string | null;
  creationType: "recorded" | "uploaded";
  visibility?: "everyone" | "followers" | "only_me";
  /**
   * Typed as the full `PermissionAudience` (matches what `CreateWaveForm`
   * actually collects, since it shares one Select/options list for both
   * comment and Duet permission) even though `comment_permission` only
   * accepts three of its four values at the database layer — `publishWaveSchema`
   * (the real boundary) validates against `COMMENT_AUDIENCES` and returns a
   * clear `ok: false` error for an out-of-range value rather than a crash.
   */
  commentPermission?: PermissionAudience | null;
  duetPermission?: PermissionAudience | null;
  collaboratorUsernames?: readonly string[];
  categories?: readonly string[];
  /** Sing over a curated/open backing track (spec §4) — see `publishWaveSchema`. */
  backingTrackId?: string | null;
}

/**
 * Step 3: publish the Wave (spec §11). Requires the caller to own the audio
 * asset and for it not to have failed processing outright — publishing
 * before processing finishes is fine (`mintPlaybackUrl` falls back to the
 * original file), publishing over a `failed` asset is not.
 *
 * When `backingTrackId` is set, this is a "sing over a track" publish (spec
 * §4): the Wave is created with `backing_track_id` set and `parent_wave_id`
 * left null (it is not a Duet of another WAVE), and a `mix_duet` job is
 * enqueued that lays this Wave's vocal over the track's own audio using the
 * existing Duet mixdown machinery — offset 0, the track gain-reduced by
 * default (`enqueueBackingTrackMixJob`, `src/lib/db/backingTracks.ts`).
 */
export async function publishWave(args: PublishWaveArgs): Promise<PublishWaveResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = publishWaveSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "This Wave can't be published yet." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();

  const asset = await getAudioAssetById(db, parsed.data.assetId).catch(() => null);
  if (!asset || asset.ownerId !== user.id) {
    return { ok: false, error: "That recording could not be found." };
  }
  if (asset.processingStatus === "failed") {
    return {
      ok: false,
      error: asset.processingError ?? "This recording failed to process. Try uploading it again.",
    };
  }

  let trackAudioAssetId: string | null = null;
  if (parsed.data.backingTrackId) {
    try {
      const track = await requireBackingTrack(db, parsed.data.backingTrackId);
      trackAudioAssetId = track.audioAssetId;
    } catch (err) {
      return { ok: false, error: describeError(err, "That backing track could not be found.") };
    }
  }

  let waveId: string;
  try {
    const wave = await createWave(db, user.id, {
      audio_asset_id: asset.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      creation_type: parsed.data.creationType,
      visibility: parsed.data.visibility,
      comment_permission: parsed.data.commentPermission,
      duet_permission: parsed.data.duetPermission,
      backing_track_id: parsed.data.backingTrackId ?? null,
      content_origin: "original",
      tags: parsed.data.categories,
    });
    waveId = wave.id;
  } catch (err) {
    return { ok: false, error: describeError(err, "We couldn't publish this Wave. Try again.") };
  }

  if (trackAudioAssetId) {
    try {
      await enqueueBackingTrackMixJob(db, {
        vocalAssetId: asset.id,
        trackAudioAssetId,
      });
    } catch (err) {
      // The Wave already published — a failed mixdown enqueue is not a
      // publish failure (mirrors the collaborator-invite tolerance below).
      // `mintPlaybackUrl` still falls back to the unmixed original in the
      // meantime, never a fake "ready" mix.
      console.error(`[publishWave] failed to enqueue backing-track mix for wave ${waveId}:`, err);
    }
  }

  const skippedCollaborators: string[] = [];
  for (const username of parsed.data.collaboratorUsernames) {
    try {
      const profile = await getProfileByUsername(db, username);
      if (!profile || profile.id === user.id) {
        skippedCollaborators.push(username);
        continue;
      }
      await inviteCollaborator(db, { waveId, profileId: profile.id, role: null });
    } catch {
      // Unknown username, blocked pair, or duplicate invite — the Wave still
      // published; collaborators are invites, never a publish precondition.
      skippedCollaborators.push(username);
    }
  }

  return { ok: true, waveId, skippedCollaborators };
}
