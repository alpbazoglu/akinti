/**
 * Shared error mapping for the abuse-prevention guards added in
 * `supabase/migrations/20260903140200_rate_limits.sql` (spec §39).
 *
 * Every rate-limited table (`comments`, `follows`, `messages`,
 * `duet_requests`, `shares`, `reports`, `audio_assets`) raises the same
 * Postgres error — SQLSTATE `AKRTL`, a code this project owns and Postgres
 * never assigns on its own — from a `BEFORE INSERT` guard trigger via
 * `check_rate_limit()`. `src/lib/db/types.ts#DatabaseError` already carries
 * that SQLSTATE through as `.code`; this module is the one place that turns
 * it into the honest, specific English copy every Server Action should show
 * instead of a raw Postgres message (spec §44 rule 9 — no silent/garbled
 * failures).
 *
 * Adopt this in any Server Action that inserts into one of the seven tables
 * above — `src/app/(app)/w/[id]/interactions.ts` (comments/shares),
 * `src/app/(app)/messages/actions.ts`, `src/app/(app)/u/[username]/actions.ts`
 * (follow), and the Duet request action module are the natural call sites;
 * none of them are owned by this stage, so this is exported for those stage
 * owners to wire in rather than edited into their files directly. This
 * module's own owned call site is `src/app/(app)/moderation/actions.ts`.
 */

import { DatabaseError } from "@/lib/db/types";
import type { MessageTranslator } from "@/lib/validation/translate";

/** Custom SQLSTATE raised by `public.check_rate_limit()` (migration 21). */
export const RATE_LIMIT_SQLSTATE = "AKRTL";

/**
 * English fallback only (`docs/I18N.md`) — kept for call sites this stage
 * does not own (`src/app/(app)/w/[id]/interactions.ts`) that read this
 * constant directly rather than through `mapModerationError` below. Every
 * call site this stage does own translates via the `Common.rateLimited`
 * message key instead, resolved for the current request locale.
 */
export const RATE_LIMIT_MESSAGE = "You're doing that too often. Try again in a few minutes.";

/** True when `error` is the rate-limit guard, specifically — never a generic Postgres failure. */
export function isRateLimitError(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === RATE_LIMIT_SQLSTATE;
}

/**
 * Map a caught error to translated copy: the rate-limit message (via `t`,
 * `Common.rateLimited` — `getTranslations()` at the caller's Server Action
 * boundary) when that's what happened, otherwise `fallback` (the caller's
 * own already-translated default for every other failure — this function
 * never invents a message for an error it doesn't recognise).
 */
export function mapModerationError(error: unknown, fallback: string, t: MessageTranslator): string {
  if (isRateLimitError(error)) {
    return t("Common.rateLimited");
  }
  return fallback;
}
