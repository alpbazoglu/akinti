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

import { openDirectConversation, sendMessage } from "@/lib/db/conversations";
import { canRequestDuet, createDuetRequest } from "@/lib/db/duetRequests";
import { answerOpenCall as answerOpenCallRow, closeOpenCall as closeOpenCallRow, getOpenCallByWaveId, setOpenCall as setOpenCallRow } from "@/lib/db/openCalls";
import { DatabaseError } from "@/lib/db/types";
import { getWaveById } from "@/lib/db/waves";
import { assertNotSuspended, getCurrentUser, SUSPENDED_ACTION_MESSAGE } from "@/lib/auth/server";
import { isRateLimitError, RATE_LIMIT_MESSAGE } from "@/lib/moderation/errors";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  answerOpenCallSchema,
  closeOpenCallSchema,
  createDuetRequestSchema,
  setOpenCallSchema,
} from "@/lib/validation/duets";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const SIGN_IN_ERROR = "Sign in to request a Duet.";
const DENIED_ERROR = "You can't request a Duet on this Wave right now.";
const DUPLICATE_ERROR = "You already have a pending Duet Request for this Wave.";

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

function describeError(err: unknown): string {
  if (isRateLimitError(err)) return RATE_LIMIT_MESSAGE;
  if (err instanceof DatabaseError) {
    if (err.code === UNIQUE_VIOLATION) return DUPLICATE_ERROR;
    if (err.code === INSUFFICIENT_PRIVILEGE) return DENIED_ERROR;
  }
  return "We couldn't send this Duet Request. Try again.";
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
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = createDuetRequestSchema.safeParse({ waveId, message });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "This Duet Request isn't valid." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();

  const wave = await getWaveById(db, parsed.data.waveId);
  if (!wave) {
    return { ok: false, error: "This Wave isn't available." };
  }
  if (wave.creatorId === user.id) {
    return { ok: false, error: "You can't request a Duet on your own Wave — record one directly instead." };
  }

  const allowed = await canRequestDuet(db, parsed.data.waveId).catch(() => false);
  if (!allowed) {
    return { ok: false, error: DENIED_ERROR };
  }

  let requestId: string;
  try {
    const request = await createDuetRequest(db, user.id, parsed.data);
    requestId = request.id;
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }

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
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = setOpenCallSchema.safeParse({ waveId, prompt, deadlineAt });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "This open call isn't valid." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const wave = await getWaveById(db, parsed.data.waveId);
  if (!wave) {
    return { ok: false, error: "This Wave isn't available." };
  }
  if (wave.creatorId !== user.id) {
    return { ok: false, error: "Only the creator can open this Wave for Duets." };
  }

  try {
    await setOpenCallRow(db, parsed.data);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof DatabaseError ? "We couldn't open this Wave for Duets. Try again." : "We couldn't do that. Try again.",
    };
  }

  revalidatePath(routes.wave(parsed.data.waveId));
  revalidatePath(routes.explore());
  return { ok: true };
}

/** Close a previously-opened call. Creator-only, same enforcement path as `setOpenCall`. */
export async function closeOpenCall(waveId: string): Promise<OpenCallActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = closeOpenCallSchema.safeParse({ waveId });
  if (!parsed.success) {
    return { ok: false, error: "That Wave isn't valid." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }
  if (!(await assertNotSuspended(user.id))) {
    return { ok: false, error: SUSPENDED_ACTION_MESSAGE };
  }

  const db = await createServerSupabaseClient();
  const call = await getOpenCallByWaveId(db, parsed.data.waveId);
  if (!call) {
    return { ok: false, error: "This Wave has no open call to close." };
  }
  if (call.creatorId !== user.id) {
    return { ok: false, error: "Only the creator can close this open call." };
  }

  try {
    await closeOpenCallRow(db, parsed.data);
  } catch {
    return { ok: false, error: "We couldn't close this open call. Try again." };
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
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = answerOpenCallSchema.safeParse({ waveId });
  if (!parsed.success) {
    return { ok: false, error: "That Wave isn't valid." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
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
      return { ok: false, error: RATE_LIMIT_MESSAGE };
    }
    if (err instanceof DatabaseError && err.code === INSUFFICIENT_PRIVILEGE) {
      return { ok: false, error: "You can't answer this open call right now." };
    }
    return { ok: false, error: "We couldn't answer this open call. Try again." };
  }

  revalidatePath(routes.wave(parsed.data.waveId));
  revalidatePath(routes.duets());
  return { ok: true, requestId };
}
