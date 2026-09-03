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

import {
  cancelDuetRequest as cancelDuetRequestRow,
  getDuetRequestById,
  respondToDuetRequest as respondToDuetRequestRow,
} from "@/lib/db/duetRequests";
import { DatabaseError } from "@/lib/db/types";
import { getCurrentUser } from "@/lib/auth/server";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  cancelDuetRequestSchema,
  respondToDuetRequestSchema,
} from "@/lib/validation/duets";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const SIGN_IN_ERROR = "Sign in to do that.";
const NOT_FOUND_ERROR = "That Duet Request could not be found.";

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

function describeError(err: unknown, notAllowedMessage: string): string {
  if (err instanceof DatabaseError) {
    if (err.code === CHECK_VIOLATION) {
      return "This Duet Request has already been responded to.";
    }
    if (err.code === INSUFFICIENT_PRIVILEGE) {
      return notAllowedMessage;
    }
  }
  return "We couldn't do that. Try again.";
}

/** Only the recipient may accept/decline (spec §15 lifecycle). */
export async function respondToDuetRequest(
  requestId: string,
  decision: "accepted" | "declined",
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = respondToDuetRequestSchema.safeParse({ requestId, decision });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That request isn't valid." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }

  const db = await createServerSupabaseClient();
  const request = await getDuetRequestById(db, parsed.data.requestId);
  if (!request) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }
  if (request.recipientId !== user.id) {
    return { ok: false, error: "Only the recipient can respond to this Duet Request." };
  }
  if (request.status !== "pending") {
    return { ok: false, error: "This Duet Request has already been responded to." };
  }

  try {
    await respondToDuetRequestRow(db, parsed.data);
  } catch (err) {
    return { ok: false, error: describeError(err, "Only the recipient can respond to this Duet Request.") };
  }

  revalidatePath(routes.duets());
  return { ok: true };
}

/** Only the requester may cancel, and only while still pending. */
export async function cancelDuetRequest(requestId: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const parsed = cancelDuetRequestSchema.safeParse({ requestId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That request isn't valid." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: SIGN_IN_ERROR };
  }

  const db = await createServerSupabaseClient();
  const request = await getDuetRequestById(db, parsed.data.requestId);
  if (!request) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }
  if (request.requesterId !== user.id) {
    return { ok: false, error: "Only the requester can cancel this Duet Request." };
  }
  if (request.status !== "pending") {
    return { ok: false, error: "This Duet Request can no longer be cancelled." };
  }

  try {
    await cancelDuetRequestRow(db, parsed.data.requestId);
  } catch (err) {
    return { ok: false, error: describeError(err, "Only the requester can cancel this Duet Request.") };
  }

  revalidatePath(routes.duets());
  return { ok: true };
}
