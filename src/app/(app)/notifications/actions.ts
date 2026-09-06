"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { listNotifications, markNotificationsRead } from "@/lib/db/notifications";
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
