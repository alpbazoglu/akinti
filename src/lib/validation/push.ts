import { z } from "zod";

/**
 * Known push service hosts (review3 finding 9): `endpoint` used to accept
 * any scheme and any host, and `src/lib/push/send.ts` POSTs to it from the
 * server with `web-push` — an unauthenticated SSRF primitive, the only
 * place in this codebase a user-supplied URL is fetched server-side. The
 * check lives here, at the validation boundary, rather than at the send
 * site, so no future write path can register an endpoint that skips it.
 */
const ALLOWED_PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  ".push.services.mozilla.com",
  "web.push.apple.com",
] as const;

/** Microsoft's WNS hosts are `wns2-<region>.notify.windows.com`, region varying by datacenter. */
const WNS_HOST_RE = /^wns2-[a-z0-9-]+\.notify\.windows\.com$/i;

function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (WNS_HOST_RE.test(host)) return true;
  return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix));
}

const PUSH_ENDPOINT_MESSAGE = "That push endpoint isn't a recognised browser push service.";

/**
 * The shape of `PushSubscription.toJSON()` in the browser
 * (`src/lib/pwa/installPrompt.ts`'s sibling push code, called from the
 * Settings → Notifications toggle). Length caps mirror the
 * `push_subscriptions` table's own check constraints
 * (`supabase/migrations/20260905170000_push_subscriptions.sql`) so a bad
 * payload is rejected here with a readable message instead of a raw
 * Postgres error.
 */
export const subscribePushSchema = z
  .object({
    endpoint: z.string().url().max(2048).refine(isAllowedPushEndpoint, { message: PUSH_ENDPOINT_MESSAGE }),
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth: z.string().min(1).max(512),
    }),
  })
  .strict();

// No allowlist refine here: unsubscribe only ever DELETEs a stored row by
// endpoint value (`deletePushSubscription`) — no server-side fetch to it —
// so it must keep working to remove a legacy row stored before this
// allowlist existed, or a stale endpoint the browser itself reports.
export const unsubscribePushSchema = z
  .object({
    endpoint: z.string().url().max(2048),
  })
  .strict();

export type SubscribePushInput = z.infer<typeof subscribePushSchema>;
export type UnsubscribePushInput = z.infer<typeof unsubscribePushSchema>;
