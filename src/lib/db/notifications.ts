/**
 * `notifications`. Every write happens through `public.push_notification`
 * (migration 08/11) — there is no client insert path, so this file only reads
 * and marks-as-read.
 */

import type { MarkNotificationsReadInput, NotificationPreferencesInput } from "@/lib/validation/moderation";
import type { Notification, NotificationPreferences, NotificationWithActor, Page } from "@/types/domain";

import { getProfilesByIds } from "./profiles";
import { toNotification } from "./mappers";
import type { Db } from "./types";
import { buildPage, clampLimit, decodeCursor, encodeCursor, keysetFilter, unwrap } from "./types";

export async function listNotifications(
  db: Db,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<NotificationWithActor>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("notifications")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("updated_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listNotifications", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.updated_at, r.id));
  const notifications = page.items.map(toNotification);

  const actorIds = [...new Set(notifications.map((n) => n.actorId).filter((id): id is string => id !== null))];
  const actors = await getProfilesByIds(db, actorIds);
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const items: NotificationWithActor[] = notifications.map((n) => ({
    ...n,
    actor: n.actorId ? (actorById.get(n.actorId) ?? null) : null,
  }));

  return { items, nextCursor: page.nextCursor };
}

export async function countUnreadNotifications(db: Db, recipientId: string): Promise<number> {
  const result = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .is("read_at", null);
  if (result.error) {
    throw result.error;
  }
  return result.count ?? 0;
}

/** Mark all (or specific) notifications read for the caller. */
export async function markNotificationsRead(
  db: Db,
  input: MarkNotificationsReadInput,
): Promise<number> {
  const result = await db.rpc("mark_notifications_read", {
    p_notification_ids: input.notificationIds ?? undefined,
  });
  return unwrap("markNotificationsRead", result);
}

export function isNotification(value: unknown): value is Notification {
  return typeof value === "object" && value !== null && "groupKey" in value;
}

/**
 * Settings → Notifications (spec §23, §25). Writes `profiles.notification_preferences`
 * directly — `profiles_update_own` RLS already scopes this to the caller's
 * own row (`id = auth.uid()`), same as every other Settings write in
 * `src/app/(app)/settings/actions.ts`. `push_notification()` (migration 22)
 * is what actually enforces these categories at write time; this is only
 * the read/write path for the toggle values themselves.
 */
export async function updateNotificationPreferences(
  db: Db,
  profileId: string,
  preferences: NotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const result = await db
    .from("profiles")
    .update({ notification_preferences: preferences })
    .eq("id", profileId)
    .select("notification_preferences")
    .single();
  const row = unwrap("updateNotificationPreferences", result);
  return row.notification_preferences;
}
