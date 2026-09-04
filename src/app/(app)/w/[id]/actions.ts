"use server";

/**
 * Server Actions for the Wave detail page (spec §11, §21): owner Edit and
 * Delete. Same contract as every other action in this codebase — parse,
 * never throw to the client, return `{ ok, ... }`.
 */

import { revalidatePath } from "next/cache";

import { assertNotSuspended, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import { deleteWave, getWaveById, updateWave } from "@/lib/db/waves";
import { routes } from "@/config/routes";
import { AUDIO_BUCKET, isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateWaveSchema } from "@/lib/validation/waves";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const SIGN_IN_ERROR = "Sign in to do that.";
const NOT_FOUND_ERROR = "That Wave could not be found.";

export interface ActionSuccess {
  readonly ok: true;
}
export interface ActionFailure {
  readonly ok: false;
  readonly error: string;
}
export type ActionResult = ActionSuccess | ActionFailure;

export interface UpdateWaveDetailsArgs {
  title?: string;
  description?: string | null;
  visibility?: "everyone" | "followers" | "only_me";
  comment_permission?: "everyone" | "followers" | "nobody" | null;
  duet_permission?: "everyone" | "followers" | "following" | "nobody" | null;
}

export async function updateWaveDetails(
  waveId: string,
  args: UpdateWaveDetailsArgs,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = updateWaveSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nothing to update." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const wave = await getWaveById(db, waveId);
  if (!wave || wave.creatorId !== user.id) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  try {
    await updateWave(db, waveId, parsed.data);
  } catch {
    return { ok: false, error: "We couldn't save these changes. Try again." };
  }

  revalidatePath(routes.wave(waveId));
  return { ok: true };
}

/**
 * Soft-deletes the Wave (RLS/`waves_guard_update`-safe: only the creator can
 * reach this row at all) and, best-effort, removes its audio's storage
 * objects via the admin client — but only if no other still-live Wave
 * references the same `audio_asset_id` (defensive; in practice each Wave
 * owns a dedicated asset). Storage cleanup failing never undoes the delete
 * itself, which is the part that actually matters for visibility.
 */
export async function deleteWaveDetails(waveId: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const wave = await getWaveById(db, waveId);
  if (!wave || wave.creatorId !== user.id) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  try {
    await deleteWave(db, waveId);
  } catch {
    return { ok: false, error: "We couldn't delete this Wave. Try again." };
  }

  try {
    const admin = createAdminClient();
    const { data: stillReferenced } = await admin
      .from("waves")
      .select("id")
      .eq("audio_asset_id", wave.audioAssetId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (!stillReferenced) {
      const { data: pathRow } = await admin
        .from("audio_assets")
        .select("original_path,processed_path")
        .eq("id", wave.audioAssetId)
        .maybeSingle();
      const paths = [pathRow?.original_path, pathRow?.processed_path].filter(
        (path): path is string => Boolean(path),
      );
      if (paths.length > 0) {
        await admin.storage.from(AUDIO_BUCKET).remove(paths);
      }
    }
  } catch (err) {
    // Best-effort: the Wave is already gone from every read path, which is
    // what the user asked for and what actually matters for visibility.
    console.error("[w/[id]/actions] storage cleanup after delete failed:", err);
  }

  revalidatePath(routes.wave(waveId));
  return { ok: true };
}
