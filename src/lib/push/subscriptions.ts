/**
 * `public.push_subscriptions` (migration 20260905170000) data access — the
 * owner-scoped read/write half of Web Push. Sending itself
 * (`src/lib/push/send.ts`) is a separate module because it runs with the
 * admin client on behalf of a *different* user (the recipient), never the
 * caller who triggered the notification.
 */

import type { Db } from "@/lib/db/types";
import { unwrapList } from "@/lib/db/types";
import type { PushSubscriptionRow } from "@/types/database";

export interface PushSubscriptionInput {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly userAgent?: string | null;
}

/**
 * Register (or re-register) a subscription for the caller. Keyed on
 * `endpoint` — the same browser/device subscribing again after its keys
 * rotate updates the existing row instead of creating a duplicate
 * (`push_subscriptions_endpoint_uniq`, the table's own unique constraint).
 */
export async function upsertPushSubscription(
  db: Db,
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  const result = await db.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (result.error) throw result.error;
}

/** Unregister the caller's subscription for one endpoint (e.g. on toggle-off). */
export async function deletePushSubscription(db: Db, userId: string, endpoint: string): Promise<void> {
  const result = await db
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (result.error) throw result.error;
}

/** Whether the caller has at least one live subscription — drives the Settings toggle's initial state. */
export async function hasPushSubscription(db: Db, userId: string): Promise<boolean> {
  const result = await db
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (result.error) throw result.error;
  return (result.count ?? 0) > 0;
}

/**
 * Every subscription for a recipient, for `src/lib/push/send.ts` to fan a
 * single notification out to (a user may have several devices/browsers
 * subscribed at once). Takes the admin client — the recipient is not the
 * caller of whatever action triggered this.
 */
export async function listPushSubscriptionsForUser(db: Db, userId: string): Promise<PushSubscriptionRow[]> {
  const result = await db.from("push_subscriptions").select("*").eq("user_id", userId);
  return unwrapList("listPushSubscriptionsForUser", result);
}
