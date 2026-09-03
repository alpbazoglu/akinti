"use server";

/**
 * `publishDuetWave` — the last step of the Duet flow (spec §15). Runs after
 * the client has already driven `createUploadTicket` -> upload ->
 * `finalizeUpload` (both from `./actions.ts`, reused unmodified — see
 * `DuetRecorder.tsx`) for the contribution stem. This action:
 *
 *  1. Re-verifies the accepted request belongs to the caller and hasn't
 *     already produced a Wave (defense-in-depth; `waves_guard_insert`,
 *     migration 12, re-checks the same thing independently at the database
 *     level and is the actual authority).
 *  2. Publishes the Duet Wave via `createDuetWave()` (`src/lib/db/waves.ts`).
 *  3. Adds the original creator as an ACCEPTED collaborator directly — not
 *     through another pending invite. They already consented to this
 *     specific collaboration by accepting the Duet Request; re-asking via a
 *     `collaborator_invite` would be exactly the notification spam spec §15
 *     says to avoid. The Wave's creator (the requester, per step 2) is
 *     authorized to set any collaborator row's status on their own Wave —
 *     `wave_collaborators_update`'s RLS policy allows the Wave creator, not
 *     only `profile_id = auth.uid()`.
 *  4. Enqueues the `mix_duet` processing job (`enqueueDuetMixJob`,
 *     `src/lib/db/duets.ts`) with `{ originalAssetId, contributionAssetId,
 *     offsetMs, preset, advancedEq }`. The Wave is published either way —
 *     see the KNOWN ISSUE note below if this step fails.
 *
 * "Marks the request as fulfilled": `duet_requests.resulting_wave_id` is set
 * automatically by the `waves_after_change` trigger (migration 11) the
 * moment step 2's insert lands, whenever `duet_request_id` is present and the
 * request is still `accepted` — there is no separate "fulfilled" status in
 * `duet_request_status` (spec's lifecycle stays `PENDING -> ACCEPTED |
 * DECLINED | CANCELLED | EXPIRED`; `resulting_wave_id` non-null on an
 * ACCEPTED row is the fulfillment marker). This action does not set it
 * directly.
 *
 * KNOWN ISSUE (documented, not silently swallowed — spec §44 "never fake
 * functionality"): `finalizeUpload` (`./actions.ts`) unconditionally enqueues
 * a plain `process_audio` job for every newly uploaded asset, including a
 * Duet contribution — it has no "this will be superseded by a mix" flag, and
 * this action cannot skip that call without duplicating `finalizeUpload`'s
 * magic-byte verification (which it must not — spec §44 rule 3). Both jobs
 * write to the SAME `audio_assets` row via `complete_audio_job`, so whichever
 * finishes last wins. In the overwhelmingly common case `process_audio`
 * (enqueued first, lower job id, same default priority) is claimed and
 * completes before `mix_duet` (enqueued here, strictly later), so the final
 * state is correct. If `process_audio` is instead still retrying (e.g. after
 * a transient failure) when `mix_duet` completes, its eventual success would
 * overwrite the mix with the unmixed solo contribution. This is a real,
 * documented race, not a hidden one — the fix is out of this agent's
 * ownership (`src/app/(app)/create/actions.ts`, `src/lib/db/audioAssets.ts`):
 * a `skipAutoProcessing` flag on `finalizeUpload`, or a version/job-id guard
 * on `complete_audio_job`, would close it.
 */

import { revalidatePath } from "next/cache";

import { getAudioAssetById } from "@/lib/db/audioAssets";
import { enqueueDuetMixJob } from "@/lib/db/duets";
import { getDuetRequestById } from "@/lib/db/duetRequests";
import { DatabaseError, ForbiddenError, NotFoundError } from "@/lib/db/types";
import { createDuetWave, inviteCollaborator, respondToCollaboratorInvite } from "@/lib/db/waves";
import { getWaveById } from "@/lib/db/waves";
import { getCurrentUser } from "@/lib/auth/server";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publishDuetWaveSchema } from "@/lib/validation/duets";
import type { AdvancedEqSettings } from "@/lib/audio/enhancement";
import type { AudioEnhancementPreset, WaveVisibility } from "@/types/domain";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const SIGN_IN_ERROR = "Sign in to publish a Duet.";

export interface ActionFailure {
  readonly ok: false;
  readonly error: string;
}
export interface PublishDuetWaveSuccess {
  readonly ok: true;
  readonly waveId: string;
  /** `false` when the Wave published but the server-side mix couldn't be queued — see the KNOWN ISSUE note above. */
  readonly mixQueued: boolean;
}
export type PublishDuetWaveResult = PublishDuetWaveSuccess | ActionFailure;

export interface PublishDuetWaveArgs {
  requestId: string;
  contributionAssetId: string;
  offsetMs: number;
  title: string;
  description?: string | null;
  visibility?: WaveVisibility;
  preset?: AudioEnhancementPreset;
  advancedEq?: AdvancedEqSettings | null;
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof NotFoundError) return "That recording could not be found.";
  if (err instanceof ForbiddenError) return "You don't have permission to do that.";
  if (err instanceof DatabaseError) return fallback;
  return fallback;
}

export async function publishDuetWave(args: PublishDuetWaveArgs): Promise<PublishDuetWaveResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = publishDuetWaveSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "This Duet can't be published yet." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }

  const db = await createServerSupabaseClient();

  const request = await getDuetRequestById(db, parsed.data.requestId);
  if (!request) {
    return { ok: false, error: "That Duet Request could not be found." };
  }
  if (request.requesterId !== user.id) {
    return { ok: false, error: "Only the requester can record and publish this Duet." };
  }
  if (request.status !== "accepted") {
    return { ok: false, error: "This Duet Request hasn't been accepted yet." };
  }
  if (request.resultingWaveId) {
    return { ok: false, error: "This Duet Request has already produced a Duet." };
  }

  const contribution = await getAudioAssetById(db, parsed.data.contributionAssetId);
  if (!contribution || contribution.ownerId !== user.id) {
    return { ok: false, error: "That recording could not be found." };
  }
  if (contribution.processingStatus === "failed") {
    return {
      ok: false,
      error: contribution.processingError ?? "This recording failed to process. Record it again.",
    };
  }

  const originalWave = await getWaveById(db, request.waveId);
  if (!originalWave) {
    return { ok: false, error: "The original Wave is no longer available." };
  }

  let waveId: string;
  try {
    const wave = await createDuetWave(db, user.id, {
      audio_asset_id: contribution.id,
      duet_request_id: request.id,
      parent_wave_id: originalWave.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      visibility: parsed.data.visibility,
      comment_permission: null,
      duet_permission: null,
      content_origin: "original",
      tags: [],
    });
    waveId = wave.id;
  } catch (err) {
    return { ok: false, error: describeError(err, "We couldn't publish this Duet. Try again.") };
  }

  try {
    // See the file header: an already-accepted collaborator, not another
    // pending invite the original creator has to act on a second time.
    const collaborator = await inviteCollaborator(db, {
      waveId,
      profileId: originalWave.creatorId,
      role: null,
    });
    await respondToCollaboratorInvite(db, collaborator.id, true);
  } catch (err) {
    // Best-effort credit: the Duet Wave itself already published — a failed
    // collaborator credit is surfaced in logs, never silently pretended to
    // have worked, but it does not undo the publish.
    console.error("[create/duetActions] failed to credit the original creator as a collaborator:", err);
  }

  let mixQueued = true;
  try {
    await enqueueDuetMixJob(db, {
      contributionAssetId: contribution.id,
      originalAssetId: originalWave.audioAssetId,
      offsetMs: parsed.data.offsetMs,
      preset: parsed.data.preset,
      advancedEq: parsed.data.advancedEq ?? null,
    });
  } catch (err) {
    mixQueued = false;
    console.error("[create/duetActions] failed to enqueue the mix_duet job:", err);
  }

  revalidatePath(routes.wave(waveId));
  revalidatePath(routes.wave(originalWave.id));
  revalidatePath(routes.duets());
  return { ok: true, waveId, mixQueued };
}
