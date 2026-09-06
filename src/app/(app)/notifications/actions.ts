"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { resolveWavePeaks } from "@/lib/audio/peaks";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { listNotifications, markNotificationsRead } from "@/lib/db/notifications";
import { getProfileById } from "@/lib/db/profiles";
import { getWaveById } from "@/lib/db/waves";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/common";
import type { NotificationWithActor, Page } from "@/types/domain";

/**
 * Server Actions backing `/notifications`. Same contract as
 * `src/app/(auth)/actions.ts`: never throw to the client, always return
 * `{ ok, error?, data? }` — a rejected Supabase call becomes a message, not a
 * stack trace.
 */
export interface NotificationActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function messageOf(error: unknown): Promise<string> {
  if (error instanceof Error) return error.message;
  const t = await getTranslations("Common");
  return t("somethingWentWrong");
}

export async function markNotificationRead(id: string): Promise<NotificationActionResult> {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) {
    const t = await getTranslations("NotificationsActions");
    return { ok: false, error: t("notificationNotFound") };
  }

  await requireUser(routes.notifications());

  try {
    const supabase = await createServerSupabaseClient();
    await markNotificationsRead(supabase, { notificationIds: [parsed.data] });
    revalidatePath(routes.notifications());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await messageOf(error) };
  }
}

export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  await requireUser(routes.notifications());

  try {
    const supabase = await createServerSupabaseClient();
    await markNotificationsRead(supabase, { notificationIds: null });
    revalidatePath(routes.notifications());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await messageOf(error) };
  }
}

export async function loadMoreNotifications(
  cursor: string | null,
): Promise<NotificationActionResult<Page<NotificationWithActor>>> {
  await requireUser(routes.notifications());

  try {
    const supabase = await createServerSupabaseClient();
    const page = await listNotifications(supabase, { cursor });
    return { ok: true, data: page };
  } catch (error) {
    return { ok: false, error: await messageOf(error) };
  }
}

export interface NotificationWaveAudio {
  waveId: string;
  title: string;
  audioAssetId: string;
  peaks: readonly number[];
  durationMs: number;
  creatorName: string | null;
}

/**
 * Minimal playback data for the inline preview on a Wave-linked notification
 * row (`DESIGN_V3_DESKTOP.md`'s "inline play for audio notifications"). Reads
 * through the signed-in user's own Supabase client — the same
 * `can_view_wave`/RLS boundary `/w/[id]` itself enforces — so a notification
 * about a Wave the viewer can no longer see (deleted, hidden, visibility
 * changed) simply fails to resolve here instead of leaking a preview of it.
 * Real peaks come from `audio_assets.peaks` (`getAudioAssetById`); the
 * playable URL is still resolved separately by the client, the same
 * `GET /api/audio/[assetId]/url` route every other inline player uses.
 */
export async function getNotificationWaveAudio(
  waveId: string,
): Promise<NotificationActionResult<NotificationWaveAudio>> {
  const parsed = uuidSchema.safeParse(waveId);
  if (!parsed.success) {
    const t = await getTranslations("NotificationsActions");
    return { ok: false, error: t("waveNotFound") };
  }

  await requireUser(routes.notifications());

  try {
    const supabase = await createServerSupabaseClient();
    const wave = await getWaveById(supabase, parsed.data);
    if (!wave) {
      const t = await getTranslations("NotificationsActions");
      return { ok: false, error: t("waveNotFound") };
    }

    const [asset, creator] = await Promise.all([
      getAudioAssetById(supabase, wave.audioAssetId),
      getProfileById(supabase, wave.creatorId),
    ]);

    if (!asset || !asset.peaks) {
      const t = await getTranslations("NotificationsActions");
      return { ok: false, error: t("audioNotReady") };
    }

    return {
      ok: true,
      data: {
        waveId: wave.id,
        title: wave.title,
        audioAssetId: wave.audioAssetId,
        peaks: resolveWavePeaks(asset.peaks.data, wave.id, asset.peaks.bits),
        durationMs: asset.durationMs ?? 0,
        creatorName: creator ? (creator.displayName ?? `@${creator.username}`) : null,
      },
    };
  } catch (error) {
    return { ok: false, error: await messageOf(error) };
  }
}

/**
 * Accept/decline for a `follow_request` notification is NOT implemented in
 * this file — `src/app/(app)/u/[username]/actions.ts` already exports
 * `acceptFollowRequest`/`declineFollowRequest` (built on the same
 * `respondToFollowRequest` helper this module would otherwise have wrapped),
 * so `NotificationItem` imports and calls those directly rather than this
 * file re-implementing the same mutation under a second name.
 */

/**
 * Accept/decline a collaborator invitation surfaced inline on a
 * `collaborator_invite` notification. Updates `wave_collaborators` directly
 * through the Supabase client (there is no db helper for this — `waves.ts`,
 * which owns that table, is out of scope for this stage). RLS
 * (`wave_collaborators_update`, migration 12) permits an invitee to update
 * their own row (`profile_id = auth.uid()`), so this only ever touches the
 * signed-in user's own pending invitation; the extra `.eq` filters below are
 * defense-in-depth, not the actual authorization boundary.
 */
export async function respondToCollaboratorInvite(
  waveId: string,
  accept: boolean,
): Promise<NotificationActionResult> {
  const parsed = uuidSchema.safeParse(waveId);
  if (!parsed.success) {
    const t = await getTranslations("NotificationsActions");
    return { ok: false, error: t("waveNotFound") };
  }

  const user = await requireUser(routes.notifications());

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("wave_collaborators")
      .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
      .eq("wave_id", parsed.data)
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .select("id");

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data || data.length === 0) {
      const t = await getTranslations("NotificationsActions");
      return { ok: false, error: t("invitationResolved") };
    }

    revalidatePath(routes.notifications());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: await messageOf(error) };
  }
}
