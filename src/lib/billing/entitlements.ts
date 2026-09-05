import type { Db } from "@/lib/db/types";
import { ForbiddenError, unwrap } from "@/lib/db/types";

/**
 * AKINTI Pro entitlement checks (PRODUCT_V2 §4/§5). The single predicate
 * every call site should use — never re-derive "is this user Pro" from a
 * raw `subscriptions` row, since `has_pro()` (migration
 * `20260906100000_subscriptions.sql`) already encodes the exact rule
 * (`trialing`/`active`, not past `current_period_end`) in one
 * SECURITY DEFINER place.
 *
 * Only gates NEW Pro-only options (pitch snap, self-harmony, stems, a
 * featured Duet slot) — spec §4/§5 is explicit that a previously free
 * feature is never paywalled, so this module has no opinion on anything
 * that already works today.
 */

export async function isPro(db: Db, userId: string): Promise<boolean> {
  const result = await db.rpc("has_pro", { p_user_id: userId });
  return unwrap("has_pro", result);
}

/** Throws `ForbiddenError` when `userId` does not currently hold AKINTI Pro. Callers map this to an honest "this option needs AKINTI Pro" message, never a raw 403. */
export async function requirePro(db: Db, userId: string): Promise<void> {
  if (!(await isPro(db, userId))) {
    throw new ForbiddenError("This option needs AKINTI Pro.");
  }
}
