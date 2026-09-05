"use server";

/**
 * Settings → Notifications → Push (`docs/PRODUCT_V2.md` §4). Same `{ ok,
 * fieldErrors?, formError?, message? }` contract as
 * `src/app/(app)/settings/actions.ts`, and the same authorization shape as
 * every other "my own row" write in this codebase: `push_subscriptions_*_own`
 * RLS (migration 20260905170000) scopes every operation to `user_id =
 * auth.uid()`, so these actions never need to check ownership themselves.
 */

import { getCurrentUser } from "@/lib/auth/server";
import type { AuthActionResult } from "@/lib/auth/types";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import { deletePushSubscription, upsertPushSubscription } from "@/lib/push/subscriptions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { subscribePushSchema, unsubscribePushSchema } from "@/lib/validation/push";

async function requireSignedInUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      result: {
        ok: false,
        formError: "Your session has expired. Sign in again to continue.",
      } satisfies AuthActionResult,
    };
  }
  return { user, result: null };
}

export interface SubscribePushFormInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** `navigator.userAgent`, for the Settings row's "this device" label later. */
  userAgent?: string;
}

/** Register the caller's `PushSubscription` (from `PushManager.subscribe()` in the client). */
export async function subscribePush(input: SubscribePushFormInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = subscribePushSchema.safeParse({ endpoint: input.endpoint, keys: input.keys });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error.flatten().fieldErrors) };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await upsertPushSubscription(supabase, user.id, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
    });
  } catch {
    return { ok: false, formError: "Could not turn on push notifications. Try again." };
  }

  return { ok: true, message: "Push notifications turned on." };
}

export interface UnsubscribePushFormInput {
  endpoint: string;
}

/** Remove the caller's subscription (toggle-off, or a stale endpoint the browser reports). */
export async function unsubscribePush(input: UnsubscribePushFormInput): Promise<AuthActionResult> {
  const { user, result } = await requireSignedInUser();
  if (!user) return result!;

  const parsed = unsubscribePushSchema.safeParse({ endpoint: input.endpoint });
  if (!parsed.success) {
    return { ok: false, formError: "That subscription isn't valid." };
  }

  const supabase = await createServerSupabaseClient();
  try {
    await deletePushSubscription(supabase, user.id, parsed.data.endpoint);
  } catch {
    return { ok: false, formError: "Could not turn off push notifications. Try again." };
  }

  return { ok: true, message: "Push notifications turned off." };
}
