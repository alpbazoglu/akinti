/**
 * Server-only Web Push sending (`docs/PRODUCT_V2.md` §4: "push notifications
 * for Duet requests/answers, open-call answers"). `web-push`
 * (`docs/research/libraries.md` §6: "PWA via Serwist + web-push for
 * notifications").
 *
 * Uses the admin/service-role client, not an RLS-scoped one: the recipient of
 * a push is, by definition, never the caller who triggered it (the requester
 * answering a Duet Request is not the requester being notified about it), so
 * `push_subscriptions_select_own` RLS would return nothing for anyone but the
 * sender's own subscriptions. This mirrors `push_notification()`
 * (`supabase/migrations/20260903120800_notifications.sql`), which is
 * `security definer` for exactly the same reason — the write/notify path
 * legitimately crosses the caller's own row boundary, same as
 * `src/lib/supabase/admin.ts`'s documented "moderation tooling" case.
 *
 * This module never throws: a push failing to send must never fail the
 * Server Action that triggered it (the in-app notification row already
 * exists via `push_notification()` regardless of whether the push itself
 * lands) — every export here is best-effort and swallows its own errors,
 * logging instead.
 *
 * i18n (`docs/I18N.md`): the notification is for the *recipient*, who is
 * never the caller whose request triggered it — there is no ambient request
 * locale to read the way a Server Action's own `getTranslations()` response
 * does. Every payload here is a message key (+ params), resolved against the
 * recipient's own `profiles.locale` (falling back to Turkish, this
 * product's primary language, when unset) via `resolvePushMessage`
 * (`./messages.ts`), never a caller-supplied literal string — a caller
 * building a title/body in its own request locale and handing it to this
 * module would show every recipient the sender's language instead of their
 * own.
 */

import "server-only";

import webpush from "web-push";

import { getProfileById } from "@/lib/db/profiles";
import type { Db } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";

import { resolvePushMessage } from "./messages";
import { listPushSubscriptionsForUser } from "./subscriptions";

/** This product's primary language (`docs/I18N.md`) — the fallback when a recipient has no `profiles.locale` preference on file yet. */
const PUSH_FALLBACK_LOCALE = "tr";

export interface PushNotificationPayload {
  /** `"Namespace.key"` into `src/messages/{tr,en}.json`, resolved for the recipient's own locale. */
  readonly titleKey: string;
  /** Each value is a `Terms.*` key (`./messages.ts`'s doc comment), not a literal display string. */
  readonly titleParams?: Record<string, string>;
  readonly bodyKey?: string;
  readonly bodyParams?: Record<string, string>;
  /** App-relative path opened on notification click (`src/app/sw.ts`). */
  readonly url?: string;
  /** Collapses repeat pushes about the same thing, e.g. `duet:<requestId>`. */
  readonly tag?: string;
}

let vapidConfigured = false;

function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidConfigured = true;
  return true;
}

/**
 * Send a push notification to every device/browser `userId` has subscribed
 * from. Call this after a Duet Request is created, answered, or an open call
 * is answered — see this stage's report for the exact one-line call sites in
 * files this stage does not own.
 *
 * Best-effort and silent on failure: no VAPID keys configured, no
 * subscriptions on file, and a push service rejecting a stale endpoint are
 * all handled without throwing. A `404`/`410` from the push service means
 * that subscription is gone for good (the user uninstalled, cleared site
 * data, or revoked notification permission) and is deleted so it stops being
 * retried forever.
 *
 * Resolves `userId`'s own `profiles.locale` here (never trusts a locale the
 * caller might pass) so `payload`'s keys always render in the language the
 * recipient themselves chose — falling back to Turkish, not
 * `DEFAULT_LOCALE`/English, matching `docs/I18N.md`'s "Turkish-first" framing
 * for a reader who has never set a preference at all.
 */
export async function sendPushToUser(userId: string, payload: PushNotificationPayload): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const admin = createAdminClient();

  let subscriptions;
  try {
    subscriptions = await listPushSubscriptionsForUser(admin, userId);
  } catch (err) {
    console.error("[push/send] could not load subscriptions:", err);
    return;
  }
  if (subscriptions.length === 0) return;

  const recipient = await getProfileById(admin, userId).catch(() => null);
  const locale = recipient?.locale ?? PUSH_FALLBACK_LOCALE;

  const title = resolvePushMessage(locale, payload.titleKey, payload.titleParams);
  const body = payload.bodyKey ? resolvePushMessage(locale, payload.bodyKey, payload.bodyParams) : undefined;

  const pushPayload = JSON.stringify({
    title,
    body,
    url: payload.url,
    tag: payload.tag,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          pushPayload,
        );
      } catch (err) {
        const statusCode = err instanceof webpush.WebPushError ? err.statusCode : null;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          return;
        }
        console.error("[push/send] delivery failed:", err);
      }
    }),
  );
}

export interface DuetPushNotification extends PushNotificationPayload {
  readonly recipientId: string;
}

/**
 * The single hook this stage adds for Duet push notifications
 * (`docs/PRODUCT_V2.md` §4: Duet requests/answers, open-call answers).
 * `notifications` has no client insert path at all — every row is written by
 * `public.push_notification()`, called from a trigger
 * (`supabase/migrations/20260903120800_notifications.sql`) — so there is
 * nothing to intercept a "new notification" event from; instead, this is
 * called directly from the same Server Action that already knows a Duet
 * Request/answer/open-call-answer just happened and who its recipient is.
 *
 * Not owned by this stage: `src/app/(app)/w/[id]/duet/actions.ts`
 * (`requestDuet`, `answerOpenCall`) and `src/app/(app)/duets/actions.ts`
 * (`respondToDuetRequest`) — see this stage's report for the exact call
 * added at each site. This mirrors the existing convention in
 * `src/lib/moderation/errors.ts` ("this module's own owned call site is
 * ...; none of [the others] are owned by this stage, so this is exported for
 * those stage owners to wire in").
 *
 * Deliberately lives here rather than in `src/lib/db/notifications.ts`
 * (which reads more naturally as "the notifications hook"): that file is
 * also imported by client-side code (`src/lib/notifications/unreadStore.ts`
 * → `SideNav` → `AppShell`), and this module pulls in `web-push`, which pulls
 * in Node-only builtins (`tls`, via `https-proxy-agent`) that break the
 * client bundle the moment anything importing them is reachable from a
 * Client Component. Keeping all of Web Push under `src/lib/push/**` is what
 * keeps that boundary real.
 *
 * Respects the recipient's `duet` notification-category preference
 * (`profiles.notification_preferences`) the same way `push_notification()`'s
 * `notification_category()` gates the in-app row — a push channel silently
 * ignoring that toggle would be a second, inconsistent notification system.
 * Never throws: a failed or skipped push must never fail the Duet action
 * that triggered it.
 */
export async function notifyDuetPush(db: Db, notification: DuetPushNotification): Promise<void> {
  try {
    const recipient = await getProfileById(db, notification.recipientId);
    if (recipient?.notificationPreferences?.duet === false) return;
    await sendPushToUser(notification.recipientId, {
      titleKey: notification.titleKey,
      titleParams: notification.titleParams,
      bodyKey: notification.bodyKey,
      bodyParams: notification.bodyParams,
      url: notification.url,
      tag: notification.tag,
    });
  } catch (err) {
    console.error("[push/send] notifyDuetPush failed:", err);
  }
}
