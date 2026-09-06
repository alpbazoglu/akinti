"use server";

/**
 * Server Actions backing `/challenges` (PRODUCT_V2 §4 "Prompts & challenges").
 * Same contract as every other action module in this codebase
 * (`src/app/(app)/moderation/actions.ts` is the closest sibling): parse with
 * Zod, never throw to the client, always return `{ ok, fieldErrors?,
 * formError?, message?, data? }`.
 *
 * Enforcement is layered, and this file never re-implements the lower
 * layers — it only surfaces their denial as a readable message:
 *   1. `canEnterChallenge()` (`can_enter_challenge` RPC) — the same predicate
 *      the entry form would use to decide whether to show itself at all.
 *   2. `challenge_entries_insert` RLS policy — re-checks it again, independently.
 *   3. `challenge_entries_guard` trigger — derives `user_id` server-side,
 *      re-validates ownership/live status, and rate-limits (`AKRTL`).
 * The moderator-only actions below (`createChallengeAction`,
 * `setChallengeStatusAction`, `upsertChallengePickAction`,
 * `removeChallengePickAction`) mirror `moderation/actions.ts`'s
 * `requireModerator` pre-check for an honest message — `challenges_insert`/
 * `_update`/`challenge_picks_insert`/`_update` RLS re-check `is_moderator()`
 * regardless of what this file does.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { assertNotSuspended, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import { fieldErrorsFromZod } from "@/lib/auth/types";
import {
  canEnterChallenge,
  createChallenge,
  enterChallenge,
  removeChallengePick,
  setChallengeStatus,
  upsertChallengePick,
  withdrawChallengeEntry,
} from "@/lib/db/challenges";
import { isModerator } from "@/lib/db/moderation";
import { DatabaseError } from "@/lib/db/types";
import { getWaveById } from "@/lib/db/waves";
import { isRateLimitError } from "@/lib/moderation/errors";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient, type SupabaseServerClient } from "@/lib/supabase/server";
import {
  createChallengeSchema,
  enterChallengeSchema,
  removeChallengePickSchema,
  setChallengeStatusSchema,
  upsertChallengePickSchema,
  withdrawChallengeEntrySchema,
} from "@/lib/validation/challenges";
import { translateFieldErrors, type MessageTranslator } from "@/lib/validation/translate";

/** Postgres insufficient_privilege — RLS/a guard trigger rejected the write. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

export interface ChallengeActionResult<T = undefined> {
  readonly ok: boolean;
  readonly fieldErrors?: Record<string, string>;
  readonly formError?: string;
  readonly message?: string;
  readonly data?: T;
}

/** A failure shape with no `data` key at all — assignable to `ChallengeActionResult<T>` for any `T`, since an absent optional property is always compatible. */
interface ChallengeActionFailure {
  readonly ok: false;
  readonly fieldErrors?: Record<string, string>;
  readonly formError?: string;
}

async function requireSignedIn(): Promise<
  | { db: SupabaseServerClient; userId: string; error: null }
  | { db: null; userId: null; error: ChallengeActionFailure }
> {
  if (!isSupabaseConfigured()) {
    const t = await getTranslations("Common");
    return { db: null, userId: null, error: { ok: false, formError: t("notConfigured") } };
  }
  const user = await getCurrentUser();
  if (!user) {
    const t = await getTranslations("Common");
    return { db: null, userId: null, error: { ok: false, formError: t("signInToContinue") } };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { db: null, userId: null, error: { ok: false, formError: SUSPENDED_ACTION_MESSAGE } };
  }
  const db = await createServerSupabaseClient();
  return { db, userId: user.id, error: null };
}

async function requireModerator(): Promise<
  { db: SupabaseServerClient; error: null } | { db: null; error: ChallengeActionFailure }
> {
  const signedIn = await requireSignedIn();
  if (signedIn.error) return { db: null, error: signedIn.error };
  if (!(await isModerator(signedIn.db))) {
    const t = await getTranslations("ChallengesActions");
    return { db: null, error: { ok: false, formError: t("notModerator") } };
  }
  return { db: signedIn.db, error: null };
}

/**
 * Enter `waveId` into `challengeId` (spec: "entering requires owning the wave
 * and the challenge being live"). Idempotent — entering twice returns the
 * same entry.
 */
export async function enterChallengeAction(input: {
  challengeId: string;
  waveId: string;
  challengeSlug: string;
}): Promise<ChallengeActionResult<{ entryId: string }>> {
  const parsed = enterChallengeSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const signedIn = await requireSignedIn();
  if (signedIn.error) return signedIn.error;
  const { db, userId } = signedIn;

  const wave = await getWaveById(db, parsed.data.waveId);
  if (!wave) {
    return { ok: false, formError: t("Common.waveNotAvailable") };
  }
  if (wave.creatorId !== userId) {
    return { ok: false, formError: t("ChallengesActions.notYourWave") };
  }

  const allowed = await canEnterChallenge(db, parsed.data.challengeId, parsed.data.waveId).catch(() => false);
  if (!allowed) {
    return { ok: false, formError: t("ChallengesActions.notOpenForEntries") };
  }

  let entryId: string;
  try {
    entryId = await enterChallenge(db, parsed.data.challengeId, parsed.data.waveId);
  } catch (err) {
    if (isRateLimitError(err)) {
      return { ok: false, formError: t("Common.rateLimited") };
    }
    if (err instanceof DatabaseError && err.code === INSUFFICIENT_PRIVILEGE) {
      return { ok: false, formError: t("ChallengesActions.notOpenForEntries") };
    }
    return { ok: false, formError: t("ChallengesActions.enterFailed") };
  }

  revalidatePath(routes.challenge(parsed.data.challengeSlug));
  return { ok: true, message: t("ChallengesActions.entered"), data: { entryId } };
}

/** Withdraw the caller's own entry. */
export async function withdrawChallengeEntryAction(input: {
  challengeId: string;
  waveId: string;
  challengeSlug: string;
}): Promise<ChallengeActionResult> {
  const parsed = withdrawChallengeEntrySchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const signedIn = await requireSignedIn();
  if (signedIn.error) return signedIn.error;
  const { db } = signedIn;

  try {
    await withdrawChallengeEntry(db, parsed.data.challengeId, parsed.data.waveId);
  } catch {
    return { ok: false, formError: t("ChallengesActions.withdrawFailed") };
  }

  revalidatePath(routes.challenge(parsed.data.challengeSlug));
  return { ok: true, message: t("ChallengesActions.withdrawn") };
}

/** Moderator-only: create a new weekly challenge (`challenges_insert` RLS re-checks `is_moderator()`). */
export async function createChallengeAction(
  input: unknown,
): Promise<ChallengeActionResult<{ id: string; slug: string }>> {
  const parsed = createChallengeSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const { db, error } = await requireModerator();
  if (error) return error;

  try {
    const challenge = await createChallenge(db, parsed.data);
    revalidatePath(routes.challenges());
    return {
      ok: true,
      message: t("ChallengesActions.created"),
      data: { id: challenge.id, slug: challenge.slug },
    };
  } catch (err) {
    if (err instanceof DatabaseError && err.code === UNIQUE_VIOLATION) {
      return { ok: false, fieldErrors: { slug: t("ChallengesActions.slugTaken") } };
    }
    return { ok: false, formError: t("ChallengesActions.createFailed") };
  }
}

/** Moderator-only: publish/close a challenge. */
export async function setChallengeStatusAction(input: {
  challengeId: string;
  status: string;
  challengeSlug?: string;
}): Promise<ChallengeActionResult> {
  const parsed = setChallengeStatusSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const { db, error } = await requireModerator();
  if (error) return error;

  try {
    await setChallengeStatus(db, parsed.data.challengeId, parsed.data.status);
  } catch {
    return { ok: false, formError: t("ChallengesActions.updateFailed") };
  }

  revalidatePath(routes.challenges());
  if (input.challengeSlug) revalidatePath(routes.challenge(input.challengeSlug));
  return { ok: true, message: t("ChallengesActions.updated") };
}

/** Moderator-only: set (or replace) one of a challenge's 5 curated ranks. */
export async function upsertChallengePickAction(input: {
  challengeId: string;
  waveId: string;
  rank: number;
  note?: string | null;
  challengeSlug?: string;
}): Promise<ChallengeActionResult> {
  const parsed = upsertChallengePickSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const { db, error } = await requireModerator();
  if (error) return error;

  try {
    await upsertChallengePick(db, parsed.data);
  } catch (err) {
    if (err instanceof DatabaseError && err.code === UNIQUE_VIOLATION) {
      return { ok: false, formError: t("ChallengesActions.rankTaken") };
    }
    if (err instanceof DatabaseError && err.code === INSUFFICIENT_PRIVILEGE) {
      return { ok: false, formError: t("ChallengesActions.notEntered") };
    }
    return { ok: false, formError: t("ChallengesActions.pickSaveFailed") };
  }

  if (input.challengeSlug) revalidatePath(routes.challenge(input.challengeSlug));
  return { ok: true, message: t("ChallengesActions.topFiveUpdated") };
}

/** Moderator-only: remove whichever Wave holds `rank` in a challenge's Top 5. */
export async function removeChallengePickAction(input: {
  challengeId: string;
  rank: number;
  challengeSlug?: string;
}): Promise<ChallengeActionResult> {
  const parsed = removeChallengePickSchema.safeParse(input);
  const t = (await getTranslations()) as MessageTranslator;
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFromZod(translateFieldErrors(t, parsed.error.flatten().fieldErrors)) };
  }

  const { db, error } = await requireModerator();
  if (error) return error;

  try {
    await removeChallengePick(db, parsed.data.challengeId, parsed.data.rank);
  } catch {
    return { ok: false, formError: t("ChallengesActions.pickRemoveFailed") };
  }

  if (input.challengeSlug) revalidatePath(routes.challenge(input.challengeSlug));
  return { ok: true, message: t("ChallengesActions.pickRemoved") };
}
