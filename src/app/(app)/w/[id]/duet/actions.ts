"use server";

/**
 * Server Action backing `/w/[id]/duet` (spec §15, §38, §46). Same contract as
 * every other action in this codebase (`src/app/(auth)/actions.ts`): parse
 * with Zod, never throw to the client, always return a typed `{ ok, ... }`
 * result.
 *
 * Enforcement is layered, and this action does not re-implement any of the
 * lower layers — it only surfaces their denial as a readable message:
 *   1. `canRequestDuet()` (`src/lib/db/duetRequests.ts`, the `can_request_duet`
 *      RPC) — the same predicate the request page used to decide whether to
 *      show the form at all, re-checked here because hiding a button is not
 *      enforcement (see `docs/DUET_SPEC.md`).
 *   2. `duet_requests_insert` RLS policy — re-checks `can_request_duet` again,
 *      independently, at the database level.
 *   3. `duet_requests_guard` trigger — derives `recipient_id` server-side,
 *      forces a fresh `PENDING` row, clamps `expires_at`.
 *   4. `duet_requests_one_pending_per_requester` partial unique index —
 *      rejects a duplicate/concurrent request (spec §46) with Postgres error
 *      code `23505`, mapped to a clear message below.
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { openDirectConversation, sendMessage } from "@/lib/db/conversations";
import { canRequestDuet, createDuetRequest } from "@/lib/db/duetRequests";
import { answerOpenCall as answerOpenCallRow, closeOpenCall as closeOpenCallRow, getOpenCallByWaveId, setOpenCall as setOpenCallRow } from "@/lib/db/openCalls";
import { DatabaseError } from "@/lib/db/types";
import { getWaveById } from "@/lib/db/waves";
import { assertNotSuspended, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import { isRateLimitError } from "@/lib/moderation/errors";
import { notifyDuetPush } from "@/lib/push/send";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { translateValidationMessage, type MessageTranslator } from "@/lib/validation/translate";
import {
  answerOpenCallSchema,
  closeOpenCallSchema,
  createDuetRequestSchema,
  setOpenCallSchema,
} from "@/lib/validation/duets";

export interface ActionFailure {
  readonly ok: false;
  readonly error: string;
}
export interface RequestDuetSuccess {
  readonly ok: true;
  readonly requestId: string;
}
export type RequestDuetResult = RequestDuetSuccess | ActionFailure;

/** Postgres unique_violation — the partial index on (wave_id, requester_id) where status = 'pending'. */
const UNIQUE_VIOLATION = "23505";
/** Postgres insufficient_privilege — RLS/`can_request_duet` rejected the insert. */
const INSUFFICIENT_PRIVILEGE = "42501";

function describeError(err: unknown, t: MessageTranslator): string {
  if (isRateLimitError(err)) return t("Common.rateLimited");
  if (err instanceof DatabaseError) {
    if (err.code === UNIQUE_VIOLATION) return t("DuetRecordActions.duplicate");
    if (err.code === INSUFFICIENT_PRIVILEGE) return t("DuetRecordActions.denied");
  }
  return t("DuetRecordActions.sendFailed");
}

/**
 * Send a Duet Request for `waveId` (spec §15). Best-effort mirrors the
 * request into the requester/creator's 1:1 conversation as a `duet_request`
 * message (spec §22 "receive Duet-related communication") via the existing
 * `conversations` helper — a failure here never fails the request itself,
 * since the `duet_request` notification (fired by the `duet_requests_after_change`
 * trigger, migration 11) has already reached the recipient regardless.
 */
export async function requestDuet(waveId: string, message: string | null): Promise<RequestDuetResult> {
  const t = (await getTranslations()) as MessageTranslator;

  if (!isSupabaseConfigured()) {
    return { ok: false, error: t("Common.notConnected") };
  }

  const parsed = createDuetRequestSchema.safeParse({ waveId, message });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message
        ? translateValidationMessage(t, parsed.error.issues[0].message)
        : t("DuetRecordActions.requestInvalid"),
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: t("DuetRecordActions.signInError") };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();

  const wave = await getWaveById(db, parsed.data.waveId);
  if (!wave) {
    return { ok: false, error: t("Common.waveNotAvailable") };
  }
  if (wave.creatorId === user.id) {
    return { ok: false, error: t("DuetRecordActions.cannotDuetOwnWave") };
  }

  const allowed = await canRequestDuet(db, parsed.data.waveId).catch(() => false);
  if (!allowed) {
    return { ok: false, error: t("DuetRecordActions.denied") };
  }

  let requestId: string;
  try {
    const request = await createDuetRequest(db, user.id, parsed.data);
    requestId = request.id;
  } catch (err) {
    return { ok: false, error: describeError(err, t) };
  }

  void notifyDuetPush(db, {
    recipientId: wave.creatorId,
    title: t("DuetRecordActions.newDuetRequestTitle"),
    body: t("DuetRecordActions.newDuetRequestBody", { duet: TERMS.duet, wave: TERMS.wave }),
    url: routes.duets(),
    tag: `duet-request:${requestId}`,
  });

  try {
    const conversationId = await openDirectConversation(db, wave.creatorId);
    await sendMessage(db, user.id, {
      kind: "duet_request",
      conversationId,
      duetRequestId: requestId,
      body: null,
    });
  } catch {
    // Best-effort: the request itself already succeeded and already notified
    // the recipient via push_notification — a failed conversation mirror
    // (e.g. the creator has messaging closed) must not undo that.
  }

  revalidatePath(routes.wave(parsed.data.waveId));
  return { ok: true, requestId };
}

/* -------------------------------------------------------------------------- */
/* Open Calls (Wave D)                                                        */
/* -------------------------------------------------------------------------- */

export interface OpenCallActionSuccess {
  readonly ok: true;
}
export type OpenCallActionResult = OpenCallActionSuccess | ActionFailure;

export interface AnswerOpenCallSuccess {
  readonly ok: true;
  readonly requestId: string;
}
export type AnswerOpenCallResult = AnswerOpenCallSuccess | ActionFailure;

/**
 * Mark the caller's own Wave "open for anyone to Duet" (docs/PRODUCT_V2.md
 * §3-4), with an optional prompt and deadline. `open_calls_guard`
 * (migration 20260905120100) independently re-derives `creator_id` from the
 * Wave and rejects anyone else — this action only surfaces that denial as a
 * readable message, it does not re-implement the check.
 */
export async function setOpenCall(
  waveId: string,
  prompt: string | null,
  deadlineAt: string | null,
): Promise<OpenCallActionResult> {
  const t = (await getTranslations()) as MessageTranslator;

  if (!isSupabaseConfigured()) {
    return { ok: false, error: t("Common.notConnected") };
  }

  const parsed = setOpenCallSchema.safeParse({ waveId, prompt, deadlineAt });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message
        ? translateValidationMessage(t, parsed.error.issues[0].message)
        : t("DuetRecordActions.openCallInvalid"),
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: t("DuetRecordActions.signInError") };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const wave = await getWaveById(db, parsed.data.waveId);
  if (!wave) {
    return { ok: false, error: t("Common.waveNotAvailable") };
  }
  if (wave.creatorId !== user.id) {
    return { ok: false, error: t("DuetRecordActions.onlyCreatorCanOpen") };
  }

  try {
    await setOpenCallRow(db, parsed.data);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof DatabaseError
        ? t("DuetRecordActions.openCallFailed")
        : t("Common.couldNotDoThat"),
    };
  }

  revalidatePath(routes.wave(parsed.data.waveId));
  revalidatePath(routes.explore());
  return { ok: true };
}

/** Close a previously-opened call. Creator-only, same enforcement path as `setOpenCall`. */
export async function closeOpenCall(waveId: string): Promise<OpenCallActionResult> {
  const t = (await getTranslations()) as MessageTranslator;

  if (!isSupabaseConfigured()) {
    return { ok: false, error: t("Common.notConnected") };
  }

  const parsed = closeOpenCallSchema.safeParse({ waveId });
  if (!parsed.success) {
    return { ok: false, error: t("DuetRecordActions.waveInvalid") };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: t("DuetRecordActions.signInError") };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const call = await getOpenCallByWaveId(db, parsed.data.waveId);
  if (!call) {
    return { ok: false, error: t("DuetRecordActions.noOpenCall") };
  }
  if (call.creatorId !== user.id) {
    return { ok: false, error: t("DuetRecordActions.onlyCreatorCanClose") };
  }

  try {
    await closeOpenCallRow(db, parsed.data);
  } catch {
    return { ok: false, error: t("DuetRecordActions.closeFailed") };
  }

  revalidatePath(routes.wave(parsed.data.waveId));
  revalidatePath(routes.explore());
  return { ok: true };
}

/**
 * Answer an open call: skips the request/accept round trip entirely by
 * calling the `answer_open_call` RPC (migration 20260905120100), which
 * creates an already-accepted `duet_requests` row atomically — honoring
 * blocks, privacy, the resolved duet permission audience and the call's own
 * deadline, all server-side. On success, redirect the caller straight to
 * `routes.duetRecord(waveId, requestId)` — there is no accept step left to
 * wait on.
 */
export async function answerOpenCall(waveId: string): Promise<AnswerOpenCallResult> {
  const t = (await getTranslations()) as MessageTranslator;

  if (!isSupabaseConfigured()) {
    return { ok: false, error: t("Common.notConnected") };
  }

  const parsed = answerOpenCallSchema.safeParse({ waveId });
  if (!parsed.success) {
    return { ok: false, error: t("DuetRecordActions.waveInvalid") };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: t("DuetRecordActions.signInError") };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();

  let requestId: string;
  try {
    requestId = await answerOpenCallRow(db, parsed.data);
  } catch (err) {
    if (isRateLimitError(err)) {
      return { ok: false, error: t("Common.rateLimited") };
    }
    if (err instanceof DatabaseError && err.code === INSUFFICIENT_PRIVILEGE) {
      return { ok: false, error: t("DuetRecordActions.answerDenied") };
    }
    return { ok: false, error: t("DuetRecordActions.answerFailed") };
  }

  const openCallWave = await getWaveById(db, parsed.data.waveId);
  if (openCallWave) {
    void notifyDuetPush(db, {
      recipientId: openCallWave.creatorId,
      title: t("DuetRecordActions.openCallAnsweredTitle"),
      body: t("DuetRecordActions.openCallAnsweredBody", { duet: TERMS.duet }),
      url: routes.duets(),
      tag: `duet-answer:${requestId}`,
    });
  }

  revalidatePath(routes.wave(parsed.data.waveId));
  revalidatePath(routes.duets());
  return { ok: true, requestId };
}
