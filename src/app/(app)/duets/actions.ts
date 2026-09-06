"use server";

/**
 * Server Actions backing `/duets` (spec §15, §38, §46): accept/decline a
 * received request, cancel a sent one. Same `{ ok, ... }` contract as every
 * other action in this codebase.
 *
 * The lifecycle itself — who may transition what, and that a terminal state
 * is immutable — is enforced by `duet_requests_guard` (migration 12) and the
 * `duet_requests_update` RLS policy, not by this file. These actions load the
 * row first only to return a specific "not found" vs. "not allowed" message;
 * the actual authority is still the database trigger, which re-checks
 * `auth.uid()` against `recipient_id`/`requester_id` independently of
 * whatever this file believes about the caller.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  cancelDuetRequest as cancelDuetRequestRow,
  getDuetRequestById,
  respondToDuetRequest as respondToDuetRequestRow,
} from "@/lib/db/duetRequests";
import { DatabaseError } from "@/lib/db/types";
import { assertNotSuspended, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import { notifyDuetPush } from "@/lib/push/send";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { translateValidationMessage, type MessageTranslator } from "@/lib/validation/translate";
import {
  cancelDuetRequestSchema,
  respondToDuetRequestSchema,
} from "@/lib/validation/duets";

export interface ActionFailure {
  readonly ok: false;
  readonly error: string;
}
export interface ActionSuccess {
  readonly ok: true;
}
export type ActionResult = ActionSuccess | ActionFailure;

/** Postgres check_violation — `duet_requests_guard`'s terminal-state-is-immutable raise. */
const CHECK_VIOLATION = "23514";
/** Postgres insufficient_privilege — the guard's "only the recipient/requester may..." raise, or RLS. */
const INSUFFICIENT_PRIVILEGE = "42501";

function describeError(err: unknown, notAllowedMessage: string, t: MessageTranslator): string {
  if (err instanceof DatabaseError) {
    if (err.code === CHECK_VIOLATION) {
      return t("DuetsActions.alreadyResponded");
    }
    if (err.code === INSUFFICIENT_PRIVILEGE) {
      return notAllowedMessage;
    }
  }
  return t("Common.couldNotDoThat");
}

/** Only the recipient may accept/decline (spec §15 lifecycle). */
export async function respondToDuetRequest(
  requestId: string,
  decision: "accepted" | "declined",
): Promise<ActionResult> {
  const t = (await getTranslations()) as MessageTranslator;

  if (!isSupabaseConfigured()) {
    return { ok: false, error: t("Common.notConnected") };
  }

  const parsed = respondToDuetRequestSchema.safeParse({ requestId, decision });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message
        ? translateValidationMessage(t, parsed.error.issues[0].message)
        : t("DuetsActions.requestInvalid"),
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: t("Common.signInToDoThat") };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const request = await getDuetRequestById(db, parsed.data.requestId);
  if (!request) {
    return { ok: false, error: t("DuetsActions.requestNotFound") };
  }
  if (request.recipientId !== user.id) {
    return { ok: false, error: t("DuetsActions.onlyRecipientCanRespond") };
  }
  if (request.status !== "pending") {
    return { ok: false, error: t("DuetsActions.alreadyResponded") };
  }

  try {
    await respondToDuetRequestRow(db, parsed.data);
  } catch (err) {
    return { ok: false, error: describeError(err, t("DuetsActions.onlyRecipientCanRespond"), t) };
  }

  // i18n (`docs/I18N.md`): keys + params only, never a resolved string —
  // `notifyDuetPush`/`sendPushToUser` resolve them against the *recipient's*
  // own `profiles.locale`, which may differ from this actor's own request
  // locale (`t` above).
  void notifyDuetPush(db, {
    recipientId: request.requesterId,
    titleKey:
      decision === "accepted"
        ? "DuetsActions.duetRequestAcceptedTitle"
        : "DuetsActions.duetRequestDeclinedTitle",
    bodyKey: decision === "accepted" ? "DuetsActions.duetRequestAcceptedBody" : "DuetsActions.duetRequestDeclinedBody",
    bodyParams: { duetRequest: "duetRequest" },
    url: routes.duets(),
    tag: `duet-answer:${parsed.data.requestId}`,
  });

  revalidatePath(routes.duets());
  return { ok: true };
}

/** Only the requester may cancel, and only while still pending. */
export async function cancelDuetRequest(requestId: string): Promise<ActionResult> {
  const t = (await getTranslations()) as MessageTranslator;

  if (!isSupabaseConfigured()) {
    return { ok: false, error: t("Common.notConnected") };
  }

  const parsed = cancelDuetRequestSchema.safeParse({ requestId });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message
        ? translateValidationMessage(t, parsed.error.issues[0].message)
        : t("DuetsActions.requestInvalid"),
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: t("Common.signInToDoThat") };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const request = await getDuetRequestById(db, parsed.data.requestId);
  if (!request) {
    return { ok: false, error: t("DuetsActions.requestNotFound") };
  }
  if (request.requesterId !== user.id) {
    return { ok: false, error: t("DuetsActions.onlyRequesterCanCancel") };
  }
  if (request.status !== "pending") {
    return { ok: false, error: t("DuetsActions.noLongerCancellable") };
  }

  try {
    await cancelDuetRequestRow(db, parsed.data.requestId);
  } catch (err) {
    return { ok: false, error: describeError(err, t("DuetsActions.onlyRequesterCanCancel"), t) };
  }

  revalidatePath(routes.duets());
  return { ok: true };
}
